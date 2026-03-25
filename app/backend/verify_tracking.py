import urllib.request
import json
import time

def get_status():
    with urllib.request.urlopen('http://localhost:9000/integrations/icon-tracker/status') as r:
        return json.loads(r.read())

print("Selecting model person.pt...")
# Get exact path
status = get_status()
models = status.get('models', [])
model_path = next((m['path'] for m in models if 'person' in m['name'].lower()), None)
if not model_path:
    print("person.pt model not found in list.")
    exit(1)

data = json.dumps({'model_path': model_path}).encode('utf-8')
req = urllib.request.Request('http://localhost:9000/integrations/icon-tracker/select-model', data=data, headers={'Content-Type': 'application/json'}, method='POST')
urllib.request.urlopen(req)

print("Waiting for detections (up to 15s)...")
dets = []
for _ in range(15):
    time.sleep(1)
    status = get_status()
    dets = status.get('detections', [])
    if dets:
        print(f"Found {len(dets)} detections.")
        break

if not dets:
    print("No detections found. Please ensure the camera is seeing something.")
    exit(0)

tid = dets[0]['track_id']
print(f"Selecting target ID: {tid}")
data = json.dumps({'track_id': tid}).encode('utf-8')
req = urllib.request.Request('http://localhost:9000/integrations/icon-tracker/select-target', data=data, headers={'Content-Type': 'application/json'}, method='POST')
urllib.request.urlopen(req)

print("Monitoring status for gimbal activity...")
found_movement = False
for i in range(10):
    time.sleep(1)
    s = get_status()
    st = s.get('status', '')
    print(f"[{i}] Status: {st}")
    if "yaw_speed=" in st or "pitch_speed=" in st:
        found_movement = True
        break

if found_movement:
    print("SUCCESS: Autonomous tracking is active and issuing gimbal commands!")
else:
    print("FAILURE: No gimbal commands detected in status text.")
