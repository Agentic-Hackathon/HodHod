"""Local production WSGI host for the integrated shopping agent."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.workspace_settings')
from config.wsgi import application
from waitress import serve

if __name__ == '__main__':
    port = int(os.environ.get('HODHOD_BRAIN_PORT', '8790'))
    print(f'HodHod agent http://127.0.0.1:{port}', flush=True)
    serve(application, host='127.0.0.1', port=port, threads=6)
