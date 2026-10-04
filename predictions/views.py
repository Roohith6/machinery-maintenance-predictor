"""
predictions/views.py
PredictView     — POST: validate input, call SageMaker via boto3, log to DB.
PredictionHistoryView — GET: operator sees own, admin sees all.
RecentAlertsView      — GET: last 10 failure predictions.
"""
import json
import time
import logging
import boto3
from botocore.exceptions import ClientError, NoCredentialsError, EndpointConnectionError

from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, generics

from .models import PredictionLog
from .serializers import PredictionInputSerializer, PredictionLogSerializer
from accounts.permissions import IsOperatorOrAdmin, IsAdminRole

logger = logging.getLogger('predictions')


# Create the SageMaker Runtime client once when Django starts.
# boto3 clients are thread-safe and maintain an HTTP connection pool.
_SAGEMAKER_CLIENT = boto3.client(
    "sagemaker-runtime",
    region_name=settings.AWS_REGION,
    aws_access_key_id=settings.AWS_ACCESS_KEY_ID or None,
    aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY or None,
)


def get_sagemaker_client():
    """
    Return the shared SageMaker Runtime client.
    """
    return _SAGEMAKER_CLIENT


def determine_health_status(predicted_failure: bool, failure_type: str, tool_wear: int) -> str:
    """
    Business logic: maps SageMaker prediction result to machine health status.
    Used to update Machine model health cards.
    """
    if predicted_failure:
        critical_types = [
            'Tool Wear Failure',
            'Heat Dissipation Failure',
            'Overstrain Failure'
        ]
        if failure_type in critical_types:
            return 'critical'
        return 'at_risk'
    # No failure predicted — check tool wear for proactive warning
    if tool_wear > 200:
        return 'at_risk'
    return 'healthy'


def parse_sagemaker_response(response_body: str) -> dict:
    """
    Parses SageMaker endpoint response.

    Supported formats:
    - JSON list:
        [0]
        [1]

    - JSON dict:
        {
            "predicted_class_id": 0,
            "predicted_label": "No Failure",
            "confidence": 0.9999,
            "probabilities": {...}
        }

        OR

        {
            "prediction": 1,
            "failure_type": "Tool Wear Failure"
        }

    - Plain string:
        "0"
        "1"
    """

    stripped = response_body.strip()

    try:
        result = json.loads(stripped)

        # --------------------------------------------------
        # JSON LIST
        # --------------------------------------------------
        if isinstance(result, list):
            predicted_failure = bool(int(result[0]))
            failure_type = (
                "Unknown" if predicted_failure else "No Failure"
            )

        # --------------------------------------------------
        # JSON DICT
        # --------------------------------------------------
        elif isinstance(result, dict):

            # Preferred format from your SageMaker endpoint
            if "predicted_class_id" in result:
                predicted_failure = int(result["predicted_class_id"]) != 0

            # Generic numeric prediction
            elif "prediction" in result:
                predicted_failure = bool(int(result["prediction"]))

            # Label-only response
            elif "predicted_label" in result:
                label = str(result["predicted_label"]).strip().lower()

                predicted_failure = label != "no failure"

            else:
                predicted_failure = False

            # Failure type
            failure_type = result.get("failure_type")

            if not failure_type:
                if "predicted_label" in result:
                    failure_type = result["predicted_label"]
                else:
                    failure_type = (
                        "Unknown"
                        if predicted_failure
                        else "No Failure"
                    )

        # --------------------------------------------------
        # Plain number
        # --------------------------------------------------
        else:
            predicted_failure = bool(int(str(result).strip()))
            failure_type = (
                "Unknown" if predicted_failure else "No Failure"
            )

    except (json.JSONDecodeError, ValueError):

        try:
            val = int(stripped)

            predicted_failure = bool(val)
            failure_type = (
                "Unknown"
                if predicted_failure
                else "No Failure"
            )

        except ValueError:
            raise ValueError(
                f"Cannot parse SageMaker response: {response_body!r}"
            )

    return {
        "predicted_failure": predicted_failure,
        "failure_type": failure_type,
    }


class PredictView(APIView):
    """
    POST /api/predictions/predict/
    Permission: Operator + Admin

    Flow:
    1. Validate 6 sensor inputs via PredictionInputSerializer
    2. Build CSV string in correct column order (matches training dataset)
    3. Call SageMaker endpoint via boto3
    4. Parse response
    5. Determine health status
    6. Save PredictionLog to DB (signal auto-updates Machine health)
    7. Return prediction result JSON
    """
    permission_classes = [IsOperatorOrAdmin]

    def post(self, request):
        serializer = PredictionInputSerializer(data=request.data)
        if not serializer.is_valid():
            logger.warning(
                f"Invalid prediction input from '{request.user.username}': "
                f"{serializer.errors}"
            )
            return Response(
                {'error': 'Invalid input data.', 'details': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )

        data = serializer.validated_data
        machine_id = data.get('machine_id', 'M-001')

        # CSV column order MUST match training dataset columns exactly:
        # Type, Air temperature [K], Process temperature [K],
        # Rotational speed [rpm], Torque [Nm], Tool wear [min]
        csv_payload = ",".join([
            str(data['machine_type']),
            str(data['air_temperature']),
            str(data['process_temperature']),
            str(data['rotational_speed']),
            str(data['torque']),
            str(data['tool_wear']),
        ])

        logger.info(
            f"Prediction request | user='{request.user.username}' | "
            f"machine={machine_id} | payload={csv_payload}"
        )

        # ── SageMaker invocation ──────────────────────────────────────────────
        try:
            client = get_sagemaker_client()
            start_time = time.perf_counter()

            response = client.invoke_endpoint(
                EndpointName=settings.SAGEMAKER_ENDPOINT_NAME,
                ContentType='text/csv',
                Body=csv_payload,
            )

            inference_time_ms = int((time.perf_counter() - start_time) * 1000)
            response_body = response['Body'].read().decode('utf-8')

            logger.info(
                f"SageMaker response | machine={machine_id} | "
                f"body={response_body!r} | time={inference_time_ms}ms"
            )

        except NoCredentialsError:
            logger.error(
                "AWS credentials not found. Check AWS_ACCESS_KEY_ID and "
                "AWS_SECRET_ACCESS_KEY in .env file."
            )
            return Response(
                {'error': 'AWS credentials not configured. Contact admin.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except ClientError as e:
            error_code = e.response['Error']['Code']
            error_msg = e.response['Error']['Message']
            logger.error(f"SageMaker ClientError | code={error_code} | msg={error_msg}")
            return Response(
                {'error': f'SageMaker error: {error_msg}'},
                status=status.HTTP_502_BAD_GATEWAY
            )
        except EndpointConnectionError:
            logger.error("Cannot connect to SageMaker endpoint. Check region and endpoint name.")
            return Response(
                {'error': 'Cannot connect to prediction service.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        except Exception as e:
            logger.error(f"Unexpected SageMaker error: {str(e)}", exc_info=True)
            return Response(
                {'error': 'Prediction service unavailable. Try again later.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        # ── Parse response ────────────────────────────────────────────────────
        try:
            parsed = parse_sagemaker_response(response_body)
            result_json = json.loads(response_body)
        except ValueError as e:
            logger.error(str(e))
            return Response(
                {'error': 'Failed to parse prediction result.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        predicted_failure = parsed['predicted_failure']
        failure_type = parsed['failure_type']
        health_status = determine_health_status(
            predicted_failure, failure_type, data['tool_wear']
        )

        # ── Save to DB ────────────────────────────────────────────────────────
        log = PredictionLog.objects.create(
            user=request.user,
            machine_id=machine_id,
            machine_type=data['machine_type'],
            air_temperature=data['air_temperature'],
            process_temperature=data['process_temperature'],
            rotational_speed=data['rotational_speed'],
            torque=data['torque'],
            tool_wear=data['tool_wear'],
            predicted_failure=predicted_failure,
            failure_type=failure_type,
            health_status=health_status,
            raw_input=dict(data),
            raw_output={'raw': response_body,"sagemaker": json.loads(response_body), 'parsed': parsed},
            inference_time_ms=inference_time_ms,
        )

        logger.info(
            f"PredictionLog id={log.id} saved | machine={machine_id} | "
            f"failure={predicted_failure} | type={failure_type} | "
            f"health={health_status}"
        )

        return Response({
            'prediction_id': log.id,
            'machine_id': machine_id,
            'predicted_failure': predicted_failure,
            'failure_type': failure_type,
            'health_status': health_status,
            'confidence': result_json.get('confidence'),
            'probabilities': result_json.get('probabilities'),
            'inference_time_ms': inference_time_ms,
            'message': (
                f"⚠️ Failure Detected: {failure_type}"
                if predicted_failure
                else "✅ Machine Operating Normally"
            ),
        }, status=status.HTTP_200_OK)


class PredictionHistoryView(generics.ListAPIView):
    """
    GET /api/predictions/history/
    Operators: see only their own predictions.
    Admins: see all predictions.
    Optional filters: ?machine_id=M-001&failure_type=Tool Wear Failure&limit=50
    """
    permission_classes = [IsOperatorOrAdmin]
    serializer_class = PredictionLogSerializer

    def get_queryset(self):
        user = self.request.user

        if user.role == 'admin':
            qs = PredictionLog.objects.all()
        else:
            qs = PredictionLog.objects.filter(user=user)

        machine_id = self.request.query_params.get('machine_id')
        failure_type = self.request.query_params.get('failure_type')
        limit = int(self.request.query_params.get('limit', 50))

        if machine_id:
            qs = qs.filter(machine_id__icontains=machine_id)
        if failure_type:
            qs = qs.filter(failure_type=failure_type)

        logger.debug(
            f"History request | user={user.username} | role={user.role} | "
            f"filters: machine_id={machine_id}, failure_type={failure_type}"
        )
        return qs.order_by('-created_at')[:limit]


class RecentAlertsView(APIView):
    """
    GET /api/predictions/alerts/
    Returns last 10 failure predictions.
    Operators: their own alerts only. Admins: all.
    """
    permission_classes = [IsOperatorOrAdmin]

    def get(self, request):
        user = request.user
        qs = PredictionLog.objects.filter(predicted_failure=True)

        if user.role != 'admin':
            qs = qs.filter(user=user)

        alerts = qs.order_by('-created_at')[:10]
        logger.debug(
            f"Alerts request | user={user.username} | count={alerts.count()}"
        )
        return Response(PredictionLogSerializer(alerts, many=True).data)