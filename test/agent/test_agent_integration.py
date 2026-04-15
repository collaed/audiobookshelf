import unittest
import json
import threading
import tempfile
import os
import sys
import importlib.util
from http.server import HTTPServer, BaseHTTPRequestHandler

# Import abs-agent.py as a module (hyphenated filename)
_agent_path = os.path.join(os.path.dirname(__file__), '../../agent/abs-agent.py')
_spec = importlib.util.spec_from_file_location('abs_agent', _agent_path)
agent = importlib.util.module_from_spec(_spec)
sys.modules['abs_agent'] = agent
_spec.loader.exec_module(agent)


class MockServer(BaseHTTPRequestHandler):
    tasks = []
    results = []

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length)) if length else {}
        MockServer.results.append(body)
        task = MockServer.tasks.pop(0) if MockServer.tasks else None
        resp = json.dumps({'task': task}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(resp))
        self.end_headers()
        self.wfile.write(resp)

    def log_message(self, *args):
        pass


class TestAgentIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(('127.0.0.1', 0), MockServer)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def setUp(self):
        MockServer.tasks.clear()
        MockServer.results.clear()

    def test_heartbeat_sends_agent_info(self):
        import urllib.request
        body = json.dumps({
            'agentId': 'test-agent',
            'version': agent.AGENT_VERSION,
            'hostname': 'testhost',
        }).encode()
        req = urllib.request.Request(
            f'http://127.0.0.1:{self.port}/api/agent/heartbeat',
            data=body,
            headers={'Content-Type': 'application/json'}
        )
        resp = urllib.request.urlopen(req, timeout=5)
        self.assertEqual(resp.status, 200)
        received = MockServer.results[-1]
        self.assertEqual(received['agentId'], 'test-agent')
        self.assertEqual(received['version'], agent.AGENT_VERSION)

    def test_diag_task_returns_system_info(self):
        config = {'_path_mappings': {}}
        result = agent.run_task('diag', {}, config)
        self.assertIn('platform', result)
        self.assertIn('python', result)
        self.assertIn('hostname', result)
        self.assertNotIn('error', result)

    def test_offline_buffer_saves_and_loads(self):
        buf_file = tempfile.mktemp(suffix='.json')
        orig = agent.BUFFER_FILE
        agent.BUFFER_FILE = buf_file
        try:
            agent.buffer_result('task-1', {'status': 'ok'})
            agent.buffer_result('task-2', {'status': 'done'})
            with open(buf_file) as f:
                buf = json.load(f)
            self.assertEqual(len(buf), 2)
            self.assertEqual(buf[0]['task_id'], 'task-1')
            self.assertEqual(buf[1]['task_id'], 'task-2')
            self.assertEqual(buf[0]['result']['status'], 'ok')
        finally:
            agent.BUFFER_FILE = orig
            if os.path.exists(buf_file):
                os.remove(buf_file)


if __name__ == '__main__':
    unittest.main()
