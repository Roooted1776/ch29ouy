import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('snapshot', Path(__file__).with_name('project-snapshot.py'))
snapshot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshot)


class SnapshotTest(unittest.TestCase):
    def test_read_only_allowlist_and_secret_filter(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            project = root / 'Example'
            project.mkdir()
            subprocess.run(['git', 'init', '-q', str(project)], check=True)
            (project / 'README.md').write_text('Useful project note.\napi_key=never-copy-this\n' + 'Long useful note. ' * 120)
            (project / '.env').write_text('TOP_SECRET=do-not-copy')
            (project / 'records.json').write_text('not approved source data')
            (project / 'STATUS.md').symlink_to(root / 'outside.md')
            (root / 'outside.md').write_text('outside source')
            before = {p: p.read_bytes() for p in project.rglob('*') if p.is_file() and not p.is_symlink()}
            manifest = snapshot.snapshot([root])
            after = {p: p.read_bytes() for p in project.rglob('*') if p.is_file() and not p.is_symlink()}
            self.assertEqual(before, after)
            self.assertEqual(len(manifest['projects']), 1)
            notes = '\n'.join(m['note'] for m in manifest['memories'])
            self.assertNotIn('never-copy-this', notes)
            self.assertNotIn('TOP_SECRET', notes)
            self.assertNotIn('outside source', notes)
            self.assertNotIn('not approved source data', notes)
            self.assertIn('Useful project note.', notes)
            self.assertTrue(all(len(m['note']) <= 600 for m in manifest['memories']))
            self.assertTrue(all(m['sources'][0]['kind'] == 'tool' for m in manifest['memories']))


if __name__ == '__main__':
    unittest.main()
