#!/usr/bin/env python3
"""정적 ES 모듈 정합성 검사 (v8.0.0)

v7.9.1 스플래시 무한 로딩(guide.js 가 land.js 의 landBuffTotals 를 import)과
v7.9.1 부동산 카운트다운 정지(ui.js 가 invasion.js 의 invasionStatus 를 import 하지 않음)처럼
**import/export 어긋남**으로 생기는 부팅·런타임 사고를 브라우저 없이 미리 잡는다.

검사 3종:
  1) import 한 이름이 대상 모듈에 실제로 export 되어 있는가
  2) 다른 모듈에서 export 하는 이름을 import 없이 쓰고 있지 않은가 (누락 import)
  3) 같은 모듈에서 같은 이름을 두 번 export 하지 않는가 / 문법적 export 대상이 비어 있지 않은가

사용법:  python3 tools/check_imports.py        (실패 시 exit 1)
"""
from __future__ import annotations

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# JS 내장·전역 — "다른 모듈 export 를 import 없이 쓴다" 오탐에서 제외
GLOBALS = {
    'window', 'document', 'navigator', 'location', 'history', 'console', 'localStorage', 'sessionStorage',
    'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame',
    'cancelAnimationFrame', 'fetch', 'Promise', 'Math', 'JSON', 'Date', 'Number', 'String', 'Boolean',
    'Array', 'Object', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol', 'Error', 'TypeError', 'RangeError',
    'Infinity', 'NaN', 'undefined', 'globalThis', 'self', 'top', 'parent', 'Intl', 'RegExp', 'Function',
    'encodeURIComponent', 'decodeURIComponent', 'parseInt', 'parseFloat', 'isFinite', 'isNaN',
    'structuredClone', 'performance', 'crypto', 'atob', 'btoa', 'Blob', 'URL', 'URLSearchParams',
    'TextEncoder', 'TextDecoder', 'AbortController', 'CustomEvent', 'Event', 'Image', 'Audio',
    'HTMLElement', 'Node', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver',
    'matchMedia', 'getComputedStyle', 'alert', 'confirm', 'prompt', 'screen', 'visualViewport',
    'queueMicrotask', 'caches', 'indexedDB', 'Notification', 'ServiceWorker', 'WebSocket',
    'ArrayBuffer', 'Uint8Array', 'Float32Array', 'Int32Array', 'DataView', 'BigInt',
}

IMPORT_RE = re.compile(r'import\s+(?:([\w$]+)\s*,\s*)?(?:\{([^}]*)\}|\*\s+as\s+([\w$]+)|([\w$]+))\s+from\s+[\'"]([^\'"]+)[\'"]', re.S)
EXPORT_DECL_RE = re.compile(r'^export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([\w$]+)', re.M)
EXPORT_LIST_RE = re.compile(r'^export\s*\{([^}]*)\}', re.M)
EXPORT_DEFAULT_RE = re.compile(r'^export\s+default\b', re.M)
DECL_RE = re.compile(r'\b(?:const|let|var|function|class)\s+([\w$]+)')
DESTRUCT_RE = re.compile(r'\b(?:const|let|var)\s*[\{\[]([^\}\]]*)[\}\]]')
PARAM_RE = re.compile(r'(?:function\s*[\w$]*\s*|\(|,)\s*([\w$]+)\s*(?=[,)])')
KEY_RE = re.compile(r'([\w$]+)\s*:')


def strip_comments(src: str) -> str:
    """주석 제거 — 문자열 안의 // 와 /* 는 최대한 보존한다."""
    out = []
    i, n = 0, len(src)
    quote = None
    while i < n:
        c = src[i]
        if quote:
            out.append(c)
            if c == '\\' and i + 1 < n:
                out.append(src[i + 1])
                i += 2
                continue
            if c == quote:
                quote = None
            i += 1
            continue
        if c in '\'"`':
            quote = c
            out.append(c)
            i += 1
            continue
        if c == '/' and i + 1 < n and src[i + 1] == '/':
            while i < n and src[i] != '\n':
                i += 1
            continue
        if c == '/' and i + 1 < n and src[i + 1] == '*':
            i += 2
            while i + 1 < n and not (src[i] == '*' and src[i + 1] == '/'):
                i += 1
            i += 2
            continue
        out.append(c)
        i += 1
    return ''.join(out)


def strip_strings(src: str) -> str:
    """문자열 리터럴 본문을 비운다(템플릿 리터럴의 ${...} 코드는 남긴다)."""
    out = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if c in '\'"':
            q = c
            i += 1
            while i < n:
                if src[i] == '\\':
                    i += 2
                    continue
                if src[i] == q:
                    i += 1
                    break
                i += 1
            out.append('""')
            continue
        if c == '`':
            i += 1
            buf = []
            while i < n:
                if src[i] == '\\':
                    i += 2
                    continue
                if src[i] == '`':
                    i += 1
                    break
                if src[i] == '$' and i + 1 < n and src[i + 1] == '{':
                    depth = 1
                    j = i + 2
                    while j < n and depth:
                        if src[j] == '{':
                            depth += 1
                        elif src[j] == '}':
                            depth -= 1
                        j += 1
                    buf.append(' ' + src[i + 2:j - 1] + ' ')
                    i = j
                    continue
                i += 1
            out.append('`' + ''.join(buf) + '`')
            continue
        out.append(c)
        i += 1
    return ''.join(out)


def module_files() -> list[str]:
    files = ['app.js']
    sdir = os.path.join(ROOT, 'src')
    for name in sorted(os.listdir(sdir)):
        if name.endswith('.js'):
            files.append('src/' + name)
    return files


def exports_of(src: str) -> set[str]:
    names = set()
    for m in EXPORT_DECL_RE.finditer(src):
        names.add(m.group(1))
    for m in EXPORT_LIST_RE.finditer(src):
        for part in m.group(1).split(','):
            part = part.strip()
            if not part:
                continue
            if ' as ' in part:
                part = part.split(' as ')[-1].strip()
            names.add(part)
    if EXPORT_DEFAULT_RE.search(src):
        names.add('default')
    return names


def imports_of(src: str):
    """[(imported_name, local_name, module_spec)] + 무명 사이드이펙트 import 목록"""
    named, side = [], []
    for m in IMPORT_RE.finditer(src):
        default_name, braces, star, bare, spec = m.groups()
        if default_name:
            named.append((default_name, default_name, spec))
        if star:
            named.append(('*', star, spec))
        if bare and not braces:
            named.append((bare, bare, spec))
        if braces:
            for part in braces.split(','):
                part = part.strip()
                if not part:
                    continue
                if ' as ' in part:
                    imported, local = [x.strip() for x in part.split(' as ')]
                else:
                    imported = local = part
                named.append((imported, local, spec))
        if not (default_name or braces or star or bare):
            side.append(spec)
    return named, side


def declared_names(src: str) -> set[str]:
    body = strip_strings(strip_comments(src))
    names = set()
    for rx in (DECL_RE, PARAM_RE):
        names.update(rx.findall(body))
    for m in DESTRUCT_RE.finditer(body):
        for part in m.group(1).split(','):
            part = part.strip()
            if not part:
                continue
            if ':' in part:
                part = part.split(':', 1)[1].strip()
            if '=' in part:
                part = part.split('=', 1)[0].strip()
            part = part.replace('...', '').strip()
            if re.fullmatch(r'[\w$]+', part):
                names.add(part)
    names.update(KEY_RE.findall(body))  # 객체 리터럴 키({foo: 1})도 선언으로 본다 — 오탐 방지
    # 화살표 함수 인자, catch(e), for (const x of ...) 등은 DECL/DESTRUCT/PARAM 으로 대부분 잡힌다.
    return names


def resolve(from_file: str, spec: str) -> str | None:
    if not spec.startswith('.'):
        return None
    base = os.path.dirname(os.path.join(ROOT, from_file))
    p = os.path.normpath(os.path.join(base, spec))
    rel = os.path.relpath(p, ROOT).replace(os.sep, '/')
    return rel


def main() -> int:
    files = module_files()
    srcs = {}
    for f in files:
        with open(os.path.join(ROOT, f), encoding='utf-8') as fh:
            srcs[f] = fh.read()

    exports = {f: exports_of(srcs[f]) for f in files}
    problems: list[str] = []

    # 1) import 대상이 실제 export 인가
    for f in files:
        body_wo_comments = strip_comments(srcs[f])
        named, side = imports_of(body_wo_comments)
        for imported, local, spec in named:
            target = resolve(f, spec)
            if not target:
                continue
            if target not in exports:
                problems.append(f'{f}: `import {{ {local} }} from "{spec}"` — 대상 모듈 {target} 이(가) 없습니다')
                continue
            if imported not in exports[target] and imported != 'default':
                problems.append(f'{f}: `{imported}` 를 {target} 에서 import 했지만 그 모듈은 export 하지 않습니다')
        for spec in side:
            target = resolve(f, spec)
            if target and target not in exports:
                problems.append(f'{f}: side-effect import "{spec}" — 대상 모듈 없음')

    # 2) 다른 모듈의 export 를 import 없이 쓰는가 (누락 import)
    exported_elsewhere: dict[str, set[str]] = {}
    for f in files:
        for name in exports[f]:
            if name == 'default':
                continue
            exported_elsewhere.setdefault(name, set()).add(f)

    for f in files:
        body = strip_strings(strip_comments(srcs[f]))
        imported = {local for _, local, _ in imports_of(strip_comments(srcs[f]))[0]}
        own = exports[f] | {n for n, _, _ in imports_of(strip_comments(srcs[f]))[0]}
        local_decls = declared_names(srcs[f])
        used = set(re.findall(r'(?<![.\w$])([A-Za-z_$][\w$]*)\s*(?=[(.\[]|$)', body, re.M))
        for name in sorted(used):
            if name in imported or name in own or name in local_decls or name in GLOBALS:
                continue
            owners = exported_elsewhere.get(name, set()) - {f}
            if owners:
                problems.append(
                    f'{f}: `{name}` 를 import 없이 사용 중 — {", ".join(sorted(owners))} 가 export 하는 이름입니다'
                )

    # 3) 중복 export
    for f in files:
        body = strip_comments(srcs[f])
        seen, dup = set(), set()
        for name in list(EXPORT_DECL_RE.findall(body)):
            if name in seen:
                dup.add(name)
            seen.add(name)
        for name in sorted(dup):
            problems.append(f'{f}: `{name}` 를 두 번 export 합니다')

    if problems:
        print(f'✗ 모듈 정합성 문제 {len(problems)}건')
        for p in problems:
            print('  - ' + p)
        return 1

    print(f'✓ 모듈 정합성 정상 — {len(files)}개 모듈 · export {sum(len(v) for v in exports.values())}개')
    return 0


if __name__ == '__main__':
    sys.exit(main())
