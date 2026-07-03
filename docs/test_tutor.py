import requests, json

# Create session
r = requests.post('http://127.0.0.1:8000/api/sessions/', json={}, timeout=10)
sid = r.json()['session_id']
print('session:', sid)

# First tutor message (code help)
msg1 = '''我的代码报错了：
```python
print(a)
```
错误：NameError: name 'a' is not defined'''
r1 = requests.post(f'http://127.0.0.1:8000/api/sessions/{sid}/chat', json={"message": msg1, "message_type": "text"}, timeout=60)
print('\n--- tutor 1 ---')
print(json.dumps(r1.json(), ensure_ascii=False, indent=2)[:600])

# Check session state
sess = requests.get(f'http://127.0.0.1:8000/api/sessions/{sid}', timeout=10).json()
print('\n--- session after tutor 1 ---')
print('socratic_depth:', sess.get('socratic_depth'))
print('dialogue_history length:', len(sess.get('dialogue_history', [])))

# Continue
msg2 = '请继续引导我'
r2 = requests.post(f'http://127.0.0.1:8000/api/sessions/{sid}/chat', json={"message": msg2, "message_type": "text"}, timeout=60)
print('\n--- tutor 2 (continue) ---')
print(json.dumps(r2.json(), ensure_ascii=False, indent=2)[:600])
