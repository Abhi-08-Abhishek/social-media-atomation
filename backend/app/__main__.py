import asyncio
import sys
import uvicorn

if __name__ == "__main__":
    # Psycopg async connections require the selector loop on Windows.
    server = uvicorn.Server(uvicorn.Config("app.main:app", host="127.0.0.1", port=8005))
    with asyncio.Runner(loop_factory=asyncio.SelectorEventLoop if sys.platform == "win32" else asyncio.new_event_loop) as runner:
        runner.run(server.serve())
