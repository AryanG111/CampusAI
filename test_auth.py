import requests
import time

BASE_URL = "http://127.0.0.1:8001"

def test_health():
    try:
        r = requests.get(f"{BASE_URL}/")
        print("Health Check:", r.json())
        return True
    except Exception as e:
        print("Server not running yet:", e)
        return False

def run_tests():
    print("--- Registering Users ---")
    r1 = requests.post(f"{BASE_URL}/register", json={"username": "teacher1", "email": "teacher1@example.com", "password": "pass", "role": "TEACHER"})
    print("Teacher Register:", r1.status_code, r1.text)
    
    r2 = requests.post(f"{BASE_URL}/register", json={"username": "student1", "email": "student1@example.com", "password": "pass", "role": "STUDENT"})
    print("Student Register:", r2.status_code, r2.text)

    print("\n--- Logging In ---")
    r_login_teacher = requests.post(f"{BASE_URL}/token", data={"username": "teacher1", "password": "pass"})
    teacher_token = r_login_teacher.json().get("access_token")
    print("Teacher Login:", r_login_teacher.status_code)

    r_login_student = requests.post(f"{BASE_URL}/token", data={"username": "student1", "password": "pass"})
    student_token = r_login_student.json().get("access_token")
    print("Student Login:", r_login_student.status_code)

    print("\n--- Testing /chat ---")
    r_chat_teacher = requests.post(f"{BASE_URL}/chat", headers={"Authorization": f"Bearer {teacher_token}"}, json={"message": "Hello"})
    print("Teacher Chat status:", r_chat_teacher.status_code)

    r_chat_student = requests.post(f"{BASE_URL}/chat", headers={"Authorization": f"Bearer {student_token}"}, json={"message": "Hello"})
    print("Student Chat status:", r_chat_student.status_code)

    print("\n--- Testing /add_pdf ---")
    files = {'file': ('test.pdf', b'%PDF-1.4\n1 0 obj\n<<>>\nendobj\n', 'application/pdf')}
    try:
        r_pdf_teacher = requests.post(f"{BASE_URL}/add_pdf", headers={"Authorization": f"Bearer {teacher_token}"}, files=files)
        print("Teacher PDF Upload status:", r_pdf_teacher.status_code)
    except Exception as e:
        print("Teacher PDF Upload failed as expected with invalid PDF payload")

    files2 = {'file': ('test.pdf', b'%PDF-1.4\n1 0 obj\n<<>>\nendobj\n', 'application/pdf')}
    r_pdf_student = requests.post(f"{BASE_URL}/add_pdf", headers={"Authorization": f"Bearer {student_token}"}, files=files2)
    print("Student PDF Upload status:", r_pdf_student.status_code)

if __name__ == "__main__":
    retries = 5
    while retries > 0:
        if test_health():
            break
        time.sleep(2)
        retries -= 1
    
    if retries > 0:
        run_tests()
    else:
        print("Failed to connect to server.")
