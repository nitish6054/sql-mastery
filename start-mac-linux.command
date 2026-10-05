#!/bin/bash
cd "$(dirname "$0")"
if command -v node >/dev/null 2>&1; then node server.js; else echo "Node.js not found - trying Python"; python3 -m http.server 5173 --bind 127.0.0.1; fi
