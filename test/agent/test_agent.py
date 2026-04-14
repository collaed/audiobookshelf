import unittest
import sys
import os
import json
import importlib.util
from unittest.mock import patch, MagicMock

# Import abs-agent.py as a module (hyphenated filename)
_agent_path = os.path.join(os.path.dirname(__file__), '../../agent/abs-agent.py')
_spec = importlib.util.spec_from_file_location('abs_agent', _agent_path)
agent = importlib.util.module_from_spec(_spec)
sys.modules['abs_agent'] = agent
_spec.loader.exec_module(agent)


class TestParsePath(unittest.TestCase):
    def test_three_level_with_sequence(self):
        r = agent._parse_path('/base/Author/Series/Book 1 - Title.mp3', '/base')
        self.assertEqual(r['author'], 'Author')
        self.assertEqual(r['series'], 'Series')
        self.assertEqual(r['sequence'], '1')
        self.assertEqual(r['title'], 'Title')

    def test_three_level_no_sequence(self):
        r = agent._parse_path('/base/Author/Series/MyBook.mp3', '/base')
        self.assertEqual(r['author'], 'Author')
        self.assertEqual(r['series'], 'Series')
        self.assertEqual(r['title'], 'MyBook')

    def test_two_level(self):
        r = agent._parse_path('/base/Author/Title.m4b', '/base')
        self.assertEqual(r['author'], 'Author')
        self.assertEqual(r['title'], 'Title')
        self.assertEqual(r['series'], '')

    def test_single_file_with_dash(self):
        r = agent._parse_path('/base/Author - Title.mp3', '/base')
        self.assertEqual(r['author'], 'Author')
        self.assertEqual(r['title'], 'Title')

    def test_single_file_no_dash(self):
        r = agent._parse_path('/base/JustATitle.flac', '/base')
        self.assertEqual(r['title'], 'JustATitle')
        self.assertEqual(r['author'], '')


class TestAudioQuality(unittest.TestCase):
    @patch('abs_agent.os.path.isfile', return_value=True)
    @patch('abs_agent.map_path', return_value='/tmp/test.mp3')
    @patch('abs_agent.subprocess.run')
    def test_returns_structure(self, mock_run, mock_map, mock_isfile):
        mock_run.return_value = MagicMock(
            stdout=json.dumps({
                "format": {"duration": "120", "bit_rate": "128000", "format_name": "mp3", "size": "1920000"},
                "streams": [{"codec_type": "audio", "codec_name": "mp3", "channels": 2, "sample_rate": "44100"}],
                "chapters": []
            }),
            returncode=0
        )
        result = agent.task_audio_quality({'path': '/test.mp3'}, {})
        self.assertEqual(result['checked'], 1)
        data = result['data']['/test.mp3']
        self.assertEqual(data['bitrate'], 128)
        self.assertEqual(data['codec'], 'mp3')
        self.assertEqual(data['channels'], 2)


class TestMoveFile(unittest.TestCase):
    @patch('abs_agent.map_path', side_effect=lambda p, c: p)
    @patch('abs_agent.os.path.exists', return_value=True)
    @patch('abs_agent.os.makedirs')
    @patch('abs_agent.shutil.move')
    @patch('abs_agent.os.path.dirname', return_value='/dst')
    @patch('abs_agent.os.path.isdir', return_value=False)
    def test_moves_file(self, mock_isdir, mock_dirname, mock_move, mock_mkdirs, mock_exists, mock_map):
        result = agent.task_move_file({'source': '/a.mp3', 'destination': '/b.mp3'}, {})
        self.assertTrue(result['moved'])
        mock_move.assert_called_once_with('/a.mp3', '/b.mp3')


class TestHandlersRegistry(unittest.TestCase):
    def test_all_expected_types(self):
        expected = {'scan_incoming', 'audio_quality', 'audio_identify', 'move_file',
                    'download_metadata', 'diag', 'update_agent', 'audio_clean',
                    'audio_diagnose', 'audio_auto_clean', 'audio_auto_clean_folder'}
        self.assertTrue(expected.issubset(set(agent.TASK_HANDLERS.keys())))

    def test_bg_tasks_subset_of_handlers(self):
        self.assertTrue(agent.BG_TASK_TYPES.issubset(set(agent.TASK_HANDLERS.keys())))


if __name__ == '__main__':
    unittest.main()
