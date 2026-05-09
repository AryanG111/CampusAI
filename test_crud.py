import requests
import json
import time

BASE_URL = "http://localhost:8001"

def test_crud_flow():
    print("Testing CRUD and Auto-Seeding Flow...")
    
    # 1. Login as Auto-Seeded Teacher
    login_data = {"username": "teacher", "password": "teacherpass"}
    r = requests.post(f"{BASE_URL}/token", data=login_data)
    if r.status_code != 200:
        print(f"FAILED: Teacher login. Teacher Auto-Seeding might have failed. Response: {r.text}")
        return
    print("SUCCESS: Logged in as auto-seeded Teacher.")
    teacher_token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {teacher_token}"}

    # 2. Get students (should be empty or contain existing)
    r = requests.get(f"{BASE_URL}/students", headers=headers)
    if r.status_code != 200:
        print(f"FAILED: Get students. Response: {r.text}")
        return
    initial_students_count = len(r.json())
    print(f"SUCCESS: Fetched students. Initial count: {initial_students_count}")

    # 3. Create a new student
    new_student = {
        "username": f"student_{int(time.time())}",
        "email": f"student_{int(time.time())}@example.com",
        "password": "password123",
        "role": "STUDENT"
    }
    r = requests.post(f"{BASE_URL}/students", json=new_student, headers=headers)
    if r.status_code != 200:
        print(f"FAILED: Create student. Response: {r.text}")
        return
    created_student = r.json()
    student_id = created_student["id"]
    print(f"SUCCESS: Created new student: {created_student['username']} with ID: {student_id}")

    # 4. Verify student login works
    st_login = {"username": new_student["username"], "password": "password123"}
    r2 = requests.post(f"{BASE_URL}/token", data=st_login)
    if r2.status_code != 200:
        print(f"FAILED: Student could not log in. Response: {r2.text}")
        return
    print("SUCCESS: Created student can log in and generate token.")
    student_token = r2.json()["access_token"]

    # 5. Create student using Student token (must fail)
    r3 = requests.post(f"{BASE_URL}/students", json=new_student, headers={"Authorization": f"Bearer {student_token}"})
    if r3.status_code == 403:
        print("SUCCESS: Blocked student from creating another student.")
    else:
        print(f"FAILED: Student should be blocked from creation. Status: {r3.status_code}")
        return

    # 6. Update the student (change email)
    update_payload = {"email": "updated_em@example.com"}
    r = requests.put(f"{BASE_URL}/students/{student_id}", json=update_payload, headers=headers)
    if r.status_code != 200:
        print(f"FAILED: Update student. Response: {r.text}")
        return
    print(f"SUCCESS: Updated student email to {r.json()['email']}")

    # 7. Delete the student
    r = requests.delete(f"{BASE_URL}/students/{student_id}", headers=headers)
    if r.status_code != 200:
        print(f"FAILED: Delete student. Response: {r.text}")
        return
    print("SUCCESS: Deleted student.")

    # 8. Verify deletion
    r = requests.get(f"{BASE_URL}/students", headers=headers)
    final_students_count = len(r.json())
    assert final_students_count == initial_students_count, f"Count mismatch: expected {initial_students_count}, got {final_students_count}"
    print("SUCCESS: Final student count verified.")
    print("\n--- ALL TESTS PASSED ---")

if __name__ == "__main__":
    test_crud_flow()
