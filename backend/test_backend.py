import requests
import json

# Test the backend API
BASE_URL = "http://localhost:8000"

def test_health():
    try:
        response = requests.get(f"{BASE_URL}/health")
        print(f"Health check: {response.status_code} - {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"Health check failed: {e}")
        return False

def test_file_upload():
    try:
        with open('sample_encrypted_logs.log', 'rb') as f:
            files = {'file': f}
            response = requests.post(f"{BASE_URL}/read-log/", files=files)
            print(f"File upload: {response.status_code} - {response.json()}")
            return response.status_code == 200
    except Exception as e:
        print(f"File upload failed: {e}")
        return False

def test_get_logs():
    try:
        response = requests.get(f"{BASE_URL}/logs")
        print(f"Get logs: {response.status_code}")
        logs = response.json().get('logs', [])
        print(f"Retrieved {len(logs)} logs")
        if logs:
            print(f"Sample log: {logs[0]}")
        return response.status_code == 200
    except Exception as e:
        print(f"Get logs failed: {e}")
        return False

def test_device_stats():
    try:
        response = requests.get(f"{BASE_URL}/stats/devices")
        print(f"Device stats: {response.status_code}")
        stats = response.json().get('devices', [])
        print(f"Device statistics: {json.dumps(stats, indent=2)}")
        return response.status_code == 200
    except Exception as e:
        print(f"Device stats failed: {e}")
        return False

if __name__ == "__main__":
    print("🧪 Testing Log Dashboard Backend API")
    print("=" * 50)
    
    # Run tests
    tests = [
        ("Health Check", test_health),
        ("File Upload", test_file_upload),
        ("Get Logs", test_get_logs),
        ("Device Stats", test_device_stats),
    ]
    
    results = []
    for test_name, test_func in tests:
        print(f"\n🔍 Running {test_name}...")
        result = test_func()
        results.append((test_name, result))
        print(f"{'✅' if result else '❌'} {test_name}: {'PASSED' if result else 'FAILED'}")
    
    print("\n" + "=" * 50)
    print("📊 Test Results Summary:")
    passed = sum(1 for _, result in results if result)
    total = len(results)
    print(f"Passed: {passed}/{total}")
    
    if passed == total:
        print("🎉 All tests passed! Backend is working correctly.")
    else:
        print("⚠️  Some tests failed. Check the backend server.")
