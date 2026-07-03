import requests, json, sys

sid = 'b8a54b9d-fc53-44d8-a701-11bdfe978f29'
msg = '我想学习 Python 变量与赋值'
url = f'http://127.0.0.1:8000/api/sessions/{sid}/chat-stream?message={requests.utils.quote(msg)}&message_type=text'

r = requests.get(url, stream=True, timeout=60)
for line in r.iter_lines():
    if not line:
        continue
    s = line.decode('utf-8')
    if s.startswith('data: '):
        try:
            d = json.loads(s[6:])
            print(json.dumps(d, ensure_ascii=False)[:600])
        except Exception as e:
            print('parse err', e, s[:200])
