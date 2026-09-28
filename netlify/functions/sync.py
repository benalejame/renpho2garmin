import json
from garminconnect import Garmin


def handler(event, context):
  headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
  }

  if event.get("httpMethod") == "OPTIONS":
    return {"statusCode": 200, "headers": headers, "body": ""}

  if event.get("httpMethod") != "POST":
    return {
        "statusCode": 405,
        "headers": headers,
        "body": json.dumps({"success": False, "error": "Método no permitido"}),
    }

  try:
    body_str = event.get("body", "{}")
    data = json.loads(body_str)

    email = data.get("email")
    password = data.get("password")
    m = data.get("metrics")

    if not email or not password:
      return {
          "statusCode": 400,
          "headers": headers,
          "body": json.dumps(
              {"success": False, "error": "Faltan credenciales de Garmin."}
          ),
      }

    if not m:
      return {
          "statusCode": 400,
          "headers": headers,
          "body": json.dumps(
              {"success": False, "error": "No se recibieron métricas del CSV."}
          ),
      }

    # Iniciar sesión en Garmin
    client = Garmin(email, password)
    client.login()

    # Enviar datos a la API de báscula de Garmin
    client.add_body_composition(
        timestamp=m.get("timestamp"),
        weight=m.get("weight"),
        percent_fat=m.get("percent_fat"),
        percent_hydration=m.get("percent_hydration"),
        visceral_fat_rating=m.get("visceral_fat_rating"),
        bone_mass=m.get("bone_mass"),
        muscle_mass=m.get("muscle_mass"),
        basal_met=m.get("basal_met"),
        physique_rating=m.get("physique_rating"),
        bmi=m.get("bmi"),
    )

    return {
        "statusCode": 200,
        "headers": headers,
        "body": json.dumps({"success": True, "data": m}),
    }

  except Exception as e:
    return {
        "statusCode": 500,
        "headers": headers,
        "body": json.dumps(
            {"success": False, "error": f"Error Garmin: {str(e)}"}
        ),
    }
