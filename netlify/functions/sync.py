import cgi
import csv
from datetime import datetime
import io
import json
from garminconnect import Garmin


def parse_float(val):
  if not val or val == "--":
    return None
  try:
    return float(val.replace(",", "."))
  except ValueError:
    return None


def parse_int(val):
  if not val or val == "--":
    return None
  try:
    return int(val)
  except ValueError:
    return None


def get_field(row, possible_keys):
  for key in possible_keys:
    if key in row and row[key] not in ("", "--"):
      return row[key]
  return None


def handler(event, context):
  if event.get("httpMethod") != "POST":
    return {
        "statusCode": 405,
        "body": json.dumps({"success": False, "error": "Método no permitido"}),
    }

  try:
    # Decodificar cuerpo multipart (archivo + credenciales)
    body_bytes = event.get("body", "")
    if event.get("isBase64Encoded", False):
      import base64

      body_bytes = base64.b64decode(body_bytes)
    elif isinstance(body_bytes, str):
      body_bytes = body_bytes.encode("utf-8")

    headers = {k.lower(): v for k, v in event.get("headers", {}).items()}
    content_type = headers.get("content-type", "")

    environ = {
        "REQUEST_METHOD": "POST",
        "CONTENT_TYPE": content_type,
        "CONTENT_LENGTH": str(len(body_bytes)),
    }

    form = cgi.FieldStorage(
        fp=io.BytesIO(body_bytes), environ=environ, keep_blank_values=True
    )

    email = form.getvalue("email")
    password = form.getvalue("password")
    file_item = form["csv_file"] if "csv_file" in form else None

    if not email or not password:
      return {
          "statusCode": 400,
          "body": json.dumps({
              "success": False,
              "error": "Faltan credenciales de Garmin.",
          }),
      }

    if not file_item or not file_item.file:
      return {
          "statusCode": 400,
          "body": json.dumps({
              "success": False,
              "error": "No se recibió un archivo CSV válido.",
          }),
      }

    # Leer el CSV en memoria
    file_content = file_item.file.read().decode("utf-8-sig")
    csv_reader = csv.DictReader(io.StringIO(file_content))
    rows = list(csv_reader)

    if not rows:
      return {
          "statusCode": 400,
          "body": json.dumps({
              "success": False,
              "error": "El archivo CSV está vacío.",
          }),
      }

    # Buscar el último registro completo
    selected = None
    for row in reversed(rows):
      fat = get_field(
          row,
          [
              "Porcentaje de grasa corporal(%)",
              "Grasa corporal(%)",
              "Body Fat(%)",
          ],
      )
      if fat:
        selected = row
        break

    if not selected:
      return {
          "statusCode": 400,
          "body": json.dumps({
              "success": False,
              "error": "No se encontraron mediciones completas en el CSV.",
          }),
      }

    # Mapeo de métricas
    peso = parse_float(get_field(selected, ["Peso(kg)", "Weight(kg)"]))
    grasa = parse_float(
        get_field(
            selected,
            [
                "Porcentaje de grasa corporal(%)",
                "Grasa corporal(%)",
                "Body Fat(%)",
            ],
        )
    )
    agua = parse_float(
        get_field(
            selected,
            [
                "Porcentaje de agua corporal(%)",
                "Agua corporal(%)",
                "Body Water(%)",
            ],
        )
    )
    musculo = parse_float(
        get_field(
            selected, ["Masa muscular(kg)", "Músculo(kg)", "Muscle Mass(kg)"]
        )
    )
    hueso = parse_float(
        get_field(selected, ["Masa ósea(kg)", "Hueso(kg)", "Bone Mass(kg)"])
    )
    visceral = parse_int(
        get_field(selected, ["Grasa visceral", "Visceral Fat"])
    )
    bmi = parse_float(get_field(selected, ["IMC", "BMI"]))
    bmr = parse_float(
        get_field(
            selected, ["Metabolismo basal(kcal)", "BMR(kcal)", "TMB(kcal)"]
        )
    )
    clasificacion = parse_int(
        get_field(
            selected,
            ["Tipo de cuerpo", "Clasificación física", "Physique Rating"],
        )
    )

    fecha = get_field(selected, ["Fecha", "Date"]).replace(".", "-")
    hora = get_field(selected, ["Hora", "Time"]) or "08:00:00"

    dt = datetime.strptime(f"{fecha} {hora}", "%Y-%m-%d %H:%M:%S")
    timestamp_iso = dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")

    # Inyección en Garmin API
    client = Garmin(email, password)
    client.login()

    client.add_body_composition(
        timestamp=timestamp_iso,
        weight=peso,
        percent_fat=grasa,
        percent_hydration=agua,
        visceral_fat_rating=visceral,
        bone_mass=hueso,
        muscle_mass=musculo,
        basal_met=bmr,
        physique_rating=clasificacion,
        bmi=bmi,
    )

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({
            "success": True,
            "data": {
                "fecha": f"{fecha} {hora}",
                "peso": peso,
                "grasa": grasa,
                "visceral": visceral,
                "musculo": musculo,
                "hueso": hueso,
                "agua": agua,
                "bmi": bmi,
                "bmr": bmr,
            },
        }),
    }

  except Exception as e:
    return {
        "statusCode": 500,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"success": False, "error": str(e)}),
    }
