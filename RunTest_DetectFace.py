from flask import Flask, request, jsonify
from flask_cors import CORS
import boto3
import base64
import io
from PIL import Image
import random

# Inicializácia aplikácie
app = Flask(__name__)
CORS(app)

# AWS klienti
rekognition = boto3.client('rekognition', region_name='us-east-1')
dynamodb = boto3.client('dynamodb', region_name='us-east-1')
s3 = boto3.client('s3', region_name='us-east-1')

# Konštanty pre S3
BUCKET_NAME = 'facial-rekognition-bucket-jakub'
FOLDER_PATH = 'index/FaceBook/'

### 🚀 **/compare - Autentifikácia používateľa pomocou AWS Rekognition**
@app.route('/compare', methods=['POST'])
def compare_faces():
    try:
        data = request.json
        if 'image' not in data:
            return jsonify({'error': 'No image data provided'}), 400

        # Dekódovanie obrázka z Base64
        image_data = data['image']
        image_binary = base64.b64decode(image_data.split(',')[1])
        image = Image.open(io.BytesIO(image_binary))

        # Konverzia na binárny stream
        stream = io.BytesIO()
        image.save(stream, format="JPEG")
        image_binary = stream.getvalue()

        # Detekcia tváre a kontrola kvality (liveness check)
        face_analysis = rekognition.detect_faces(
            Image={'Bytes': image_binary},
            Attributes=['ALL']
        )

        if not face_analysis['FaceDetails']:
            return jsonify({'status': 'error', 'message': 'No faces detected in the image'}), 400

        detected_face = face_analysis['FaceDetails'][0]

        # Prahové hodnoty pre liveness check
        brightness = detected_face.get('Quality', {}).get('Brightness', 0)
        sharpness = detected_face.get('Quality', {}).get('Sharpness', 0)

        if brightness > 90 or sharpness > 90:
            return jsonify({'status': 'error', 'message': 'Possible photo detected. Liveness check failed'}), 400

        # Hľadanie zhody v AWS Rekognition
        response = rekognition.search_faces_by_image(
            CollectionId='family-collection',
            Image={'Bytes': image_binary}
        )

        if not response.get('FaceMatches', []):
            return jsonify({'status': 'error', 'message': 'No face matches found'}), 200

        unique_names = set()  # Ukladanie unikátnych mien
        results = []

        for match in response['FaceMatches']:
            face_id = match['Face']['FaceId']
            confidence = match['Face']['Confidence']

            # Načítanie údajov z DynamoDB
            face = dynamodb.get_item(
                TableName='family-collection',
                Key={'RekognitionId': {'S': face_id}}
            )

            # Skontrolujeme, či má DynamoDB meno
            if 'Item' not in face or 'FullName' not in face['Item']:
                continue

            full_name = face['Item']['FullName']['S']

            if full_name not in unique_names:
                unique_names.add(full_name)
                gender = detected_face.get('Gender', {}).get('Value', 'Unknown')
                age_range = detected_face.get('AgeRange', {})
                age = f"{age_range.get('Low', '?')}-{age_range.get('High', '?')}"
                emotions = detected_face.get('Emotions', [])
                primary_emotion = max(emotions, key=lambda e: e['Confidence']) if emotions else {'Type': 'Unknown', 'Confidence': 0}

                results.append({
                    'name': full_name,
                    'confidence': confidence,
                    'gender': gender,
                    'age_range': age,
                    'emotion': {
                        'type': primary_emotion['Type'],
                        'confidence': primary_emotion['Confidence']
                    }
                })

        if not results:
            return jsonify({'status': 'error', 'message': 'No valid face matches found'}), 200

        return jsonify({'status': 'success', 'results': results}), 200

    except Exception as e:
        print('Error:', str(e))
        return jsonify({'status': 'error', 'message': str(e)}), 500

### 🚀 **/upload - Nahrávanie obrázkov do S3 s náhodným názvom (1-25)**
@app.route('/upload', methods=['POST'])
def upload_image():
    try:
        full_name = request.form.get('fullName')
        file = request.files.get('file')

        if not full_name or not file:
            return jsonify({"error": "Full name and file are required"}), 400

        existing_keys = get_existing_keys_in_folder(FOLDER_PATH)
        available_numbers = set(range(1, 26)) - {int(key.split('.')[0]) for key in existing_keys if key.split('.')[0].isdigit()}

        if not available_numbers:
            return jsonify({"error": "No available filenames left (1-25)."}), 500

        random_number = random.choice(list(available_numbers))
        file_name = f"{random_number}.jpeg"

        s3.upload_fileobj(
            file,
            BUCKET_NAME,
            f"{FOLDER_PATH}{file_name}",
            ExtraArgs={"Metadata": {"FullName": full_name}}
        )

        return jsonify({
            "message": "File uploaded successfully",
            "filename": file_name,
            "path": f"{FOLDER_PATH}{file_name}"
        }), 200

    except Exception as e:
        print('Error:', str(e))
        return jsonify({'status': 'error', 'message': str(e)}), 500

### 📂 Pomocná funkcia: Získanie existujúcich súborov v priečinku
def get_existing_keys_in_folder(folder_path):
    try:
        response = s3.list_objects_v2(
            Bucket=BUCKET_NAME,
            Prefix=folder_path
        )
        return [obj['Key'].split('/')[-1] for obj in response.get('Contents', [])]
    except Exception as e:
        print("Error fetching existing keys:", e)
        return []

# Spustenie aplikácie – pripravené na spustenie v režime background
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False)
