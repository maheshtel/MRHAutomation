#!/usr/bin/env python3
import os
import sys

root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
issues = {}

try:
    import yaml
    have_yaml = True
except Exception:
    have_yaml = False

for dirpath, dirs, files in os.walk(root):
    for name in files:
        if not (name.endswith('.yaml') or name.endswith('.yml')):
            continue
        path = os.path.join(dirpath, name)
        rel = os.path.relpath(path, root)
        with open(path, 'r', encoding='utf-8') as f:
            text = f.read()
        file_issues = []
        if '```' in text:
            file_issues.append('Contains Markdown code fence ```')
        if '\t' in text:
            file_issues.append('Contains tab characters (invalid YAML indentation)')
        # quick heuristic: file starts/ends with code fence
        stripped = text.lstrip()
        if stripped.startswith('```'):
            file_issues.append('File begins with a Markdown code fence')
        if text.rstrip().endswith('```'):
            file_issues.append('File ends with a Markdown code fence')

        if have_yaml:
            try:
                # try parsing all documents
                list(yaml.safe_load_all(text))
            except Exception as e:
                file_issues.append(f'YAML parse error: {e}')

        if file_issues:
            issues[rel] = file_issues

if not issues:
    print('No obvious YAML issues detected.')
    sys.exit(0)

print('YAML issues found:')
for path, entries in sorted(issues.items()):
    print(f'- {path}')
    for e in entries:
        print(f'    - {e}')

sys.exit(2)
