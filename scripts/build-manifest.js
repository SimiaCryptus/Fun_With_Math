#!/usr/bin/env node
'use strict';
/**
 * scripts/build-manifest.ts
 *
 * Walks the content roots, reads every `entry.json` sidecar, validates it, and
 * reassembles a single unified `manifest.json`.
 *
 *   node --experimental-strip-types scripts/build-manifest.ts
 *   npx tsx scripts/build-manifest.ts --legacy
 *   npx tsx scripts/build-manifest.ts --check      # CI: fail on drift
 *
 * Flags:
 *   --root=<path>   repository root (default: parent of scripts/)
 *   --roots=<a,b,c>    comma-separated scan roots (default: entire repo)
 *   --scan-roots-only  restrict the walk to SCAN_ROOTS from manifest_schema
 *   --max-depth=<n>    recursion limit per root (default: SCAN_MAX_DEPTH + 1)
 *   --out=<file>    output path (default: manifest.json)
 *   --legacy        also regenerate labs.json / games.json / essays.json
 *   --include-hidden  keep entries marked `"hidden": true`
 *   --no-verify     skip on-disk existence checks for href/readme/video
 *   --no-git        skip git/submodule repository discovery
 *   --git-remote=<name>       remote used for repo URLs (default: origin)
 *   --submodule-status=<file> fallback for `git submodule status` output
 *                             (default: submodules.txt)
 *   --pin-head      also record the outer repo's HEAD commit/branch
 *   --check         write nothing; exit 1 if any output would change
 *   --quiet         only print the summary
 */
var __assign =
  (this && this.__assign) ||
  function () {
    __assign =
      Object.assign ||
      function (t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
          s = arguments[i];
          for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
      };
    return __assign.apply(this, arguments);
  };
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator['throw'](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
var __generator =
  (this && this.__generator) ||
  function (thisArg, body) {
    var _ = {
        label: 0,
        sent: function () {
          if (t[0] & 1) throw t[1];
          return t[1];
        },
        trys: [],
        ops: [],
      },
      f,
      y,
      t,
      g = Object.create((typeof Iterator === 'function' ? Iterator : Object).prototype);
    return (
      (g.next = verb(0)),
      (g['throw'] = verb(1)),
      (g['return'] = verb(2)),
      typeof Symbol === 'function' &&
        (g[Symbol.iterator] = function () {
          return this;
        }),
      g
    );
    function verb(n) {
      return function (v) {
        return step([n, v]);
      };
    }
    function step(op) {
      if (f) throw new TypeError('Generator is already executing.');
      while ((g && ((g = 0), op[0] && (_ = 0)), _))
        try {
          if (
            ((f = 1),
            y &&
              (t =
                op[0] & 2
                  ? y['return']
                  : op[0]
                    ? y['throw'] || ((t = y['return']) && t.call(y), 0)
                    : y.next) &&
              !(t = t.call(y, op[1])).done)
          )
            return t;
          if (((y = 0), t)) op = [op[0] & 2, t.value];
          switch (op[0]) {
            case 0:
            case 1:
              t = op;
              break;
            case 4:
              _.label++;
              return { value: op[1], done: false };
            case 5:
              _.label++;
              y = op[1];
              op = [0];
              continue;
            case 7:
              op = _.ops.pop();
              _.trys.pop();
              continue;
            default:
              if (
                !((t = _.trys), (t = t.length > 0 && t[t.length - 1])) &&
                (op[0] === 6 || op[0] === 2)
              ) {
                _ = 0;
                continue;
              }
              if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
                _.label = op[1];
                break;
              }
              if (op[0] === 6 && _.label < t[1]) {
                _.label = t[1];
                t = op;
                break;
              }
              if (t && _.label < t[2]) {
                _.label = t[2];
                _.ops.push(op);
                break;
              }
              if (t[2]) _.ops.pop();
              _.trys.pop();
              continue;
          }
          op = body.call(thisArg, _);
        } catch (e) {
          op = [6, e];
          y = 0;
        } finally {
          f = t = 0;
        }
      if (op[0] & 5) throw op[1];
      return { value: op[0] ? op[1] : void 0, done: true };
    }
  };
var __await =
  (this && this.__await) ||
  function (v) {
    return this instanceof __await ? ((this.v = v), this) : new __await(v);
  };
var __asyncValues =
  (this && this.__asyncValues) ||
  function (o) {
    if (!Symbol.asyncIterator) throw new TypeError('Symbol.asyncIterator is not defined.');
    var m = o[Symbol.asyncIterator],
      i;
    return m
      ? m.call(o)
      : ((o = typeof __values === 'function' ? __values(o) : o[Symbol.iterator]()),
        (i = {}),
        verb('next'),
        verb('throw'),
        verb('return'),
        (i[Symbol.asyncIterator] = function () {
          return this;
        }),
        i);
    function verb(n) {
      i[n] =
        o[n] &&
        function (v) {
          return new Promise(function (resolve, reject) {
            ((v = o[n](v)), settle(resolve, reject, v.done, v.value));
          });
        };
    }
    function settle(resolve, reject, d, v) {
      Promise.resolve(v).then(function (v) {
        resolve({ value: v, done: d });
      }, reject);
    }
  };
var __asyncDelegator =
  (this && this.__asyncDelegator) ||
  function (o) {
    var i, p;
    return (
      (i = {}),
      verb('next'),
      verb('throw', function (e) {
        throw e;
      }),
      verb('return'),
      (i[Symbol.iterator] = function () {
        return this;
      }),
      i
    );
    function verb(n, f) {
      i[n] = o[n]
        ? function (v) {
            return (p = !p) ? { value: __await(o[n](v)), done: false } : f ? f(v) : v;
          }
        : f;
    }
  };
var __asyncGenerator =
  (this && this.__asyncGenerator) ||
  function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError('Symbol.asyncIterator is not defined.');
    var g = generator.apply(thisArg, _arguments || []),
      i,
      q = [];
    return (
      (i = Object.create((typeof AsyncIterator === 'function' ? AsyncIterator : Object).prototype)),
      verb('next'),
      verb('throw'),
      verb('return', awaitReturn),
      (i[Symbol.asyncIterator] = function () {
        return this;
      }),
      i
    );
    function awaitReturn(f) {
      return function (v) {
        return Promise.resolve(v).then(f, reject);
      };
    }
    function verb(n, f) {
      if (g[n]) {
        i[n] = function (v) {
          return new Promise(function (a, b) {
            q.push([n, v, a, b]) > 1 || resume(n, v);
          });
        };
        if (f) i[n] = f(i[n]);
      }
    }
    function resume(n, v) {
      try {
        step(g[n](v));
      } catch (e) {
        settle(q[0][3], e);
      }
    }
    function step(r) {
      r.value instanceof __await
        ? Promise.resolve(r.value.v).then(fulfill, reject)
        : settle(q[0][2], r);
    }
    function fulfill(value) {
      resume('next', value);
    }
    function reject(value) {
      resume('throw', value);
    }
    function settle(f, v) {
      if ((f(v), q.shift(), q.length)) resume(q[0][0], q[0][1]);
    }
  };
var __spreadArray =
  (this && this.__spreadArray) ||
  function (to, from, pack) {
    if (pack || arguments.length === 2)
      for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
          if (!ar) ar = Array.prototype.slice.call(from, 0, i);
          ar[i] = from[i];
        }
      }
    return to.concat(ar || Array.prototype.slice.call(from));
  };
var __values =
  (this && this.__values) ||
  function (o) {
    var s = typeof Symbol === 'function' && Symbol.iterator,
      m = s && o[s],
      i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === 'number')
      return {
        next: function () {
          if (o && i >= o.length) o = void 0;
          return { value: o && o[i++], done: !o };
        },
      };
    throw new TypeError(s ? 'Object is not iterable.' : 'Symbol.iterator is not defined.');
  };
var _a;
Object.defineProperty(exports, '__esModule', { value: true });
var node_fs_1 = require('node:fs');
var node_path_1 = require('node:path');
var node_process_1 = require('node:process');
var node_url_1 = require('node:url');
var node_child_process_1 = require('node:child_process');
var node_util_1 = require('node:util');
var manifest_schema_ts_1 = require('./manifest_schema.ts');
/* ---------------------------------------------------------------- args */
var argv = node_process_1.default.argv.slice(2);
var flag = function (name) {
  return argv.includes('--'.concat(name));
};
var opt = function (name, fallback) {
  var _a, _b;
  return (_b =
    (_a = argv.find(function (a) {
      return a.startsWith('--'.concat(name, '='));
    })) === null || _a === void 0
      ? void 0
      : _a.slice(name.length + 3)) !== null && _b !== void 0
    ? _b
    : fallback;
};
var listOpt = function (name) {
  var _a;
  var raw =
    (_a = argv.find(function (a) {
      return a.startsWith('--'.concat(name, '='));
    })) === null || _a === void 0
      ? void 0
      : _a.slice(name.length + 3);
  if (raw === undefined) return null;
  return raw
    .split(',')
    .map(function (s) {
      return s
        .trim()
        .replace(/^\.\/+/, '')
        .replace(/\/+$/, '');
    })
    .filter(function (s) {
      return s.length > 0;
    });
};
var HERE = node_path_1.default.dirname((0, node_url_1.fileURLToPath)(import.meta.url));
var ROOT = node_path_1.default.resolve(opt('root', node_path_1.default.join(HERE, '..')));
var OUT = opt('out', manifest_schema_ts_1.MANIFEST_FILENAME);
// `''` means "start at the repository root and walk everything". Sidecars live
// wherever the submodule happens to be checked out (tools/, physics/, ca/, …),
// so a fixed SCAN_ROOTS list silently drops entries as soon as a new top-level
// directory appears. Opt back into the old behaviour with --scan-roots-only.
var ROOTS =
  (_a = listOpt('roots')) !== null && _a !== void 0
    ? _a
    : flag('scan-roots-only')
      ? __spreadArray([], manifest_schema_ts_1.SCAN_ROOTS, true)
      : [''];
// depth is counted relative to each scan root, so walking from '' costs one
// extra level compared to walking from 'games'.
var MAX_DEPTH = Number.isFinite(Number(opt('max-depth', '')))
  ? Number(opt('max-depth', String(manifest_schema_ts_1.SCAN_MAX_DEPTH + 1)))
  : manifest_schema_ts_1.SCAN_MAX_DEPTH + 1;
var WRITE_LEGACY = flag('legacy');
var INCLUDE_HIDDEN = flag('include-hidden');
var VERIFY = !flag('no-verify');
var GIT = !flag('no-git');
var GIT_REMOTE = opt('git-remote', 'origin');
var STATUS_FILE = opt('submodule-status', 'submodules.txt');
var PIN_HEAD = flag('pin-head');
var CHECK = flag('check');
var QUIET = flag('quiet');
var log = function () {
  var a = [];
  for (var _i = 0; _i < arguments.length; _i++) {
    a[_i] = arguments[_i];
  }
  if (!QUIET) console.log.apply(console, a);
};
/* --------------------------------------------------------------- walk */
// Full-tree scanning means we must be defensive about build/vendor junk that
// SCAN_IGNORE may not have needed to list back when only labs/ and games/ were
// walked.
var IGNORED_DIRS = new Set(
  __spreadArray(
    __spreadArray([], manifest_schema_ts_1.SCAN_IGNORE, true),
    [
      'node_modules',
      'dist',
      'build',
      'out',
      'target',
      'vendor',
      'coverage',
      '__pycache__',
      'venv',
      'site-packages',
    ],
    false
  )
);
function findEntryFiles(relDir_1) {
  return __asyncGenerator(this, arguments, function findEntryFiles_1(relDir, depth) {
    var dirents, err_1, _i, dirents_1, dirent, rel;
    if (depth === void 0) {
      depth = 0;
    }
    return __generator(this, function (_a) {
      switch (_a.label) {
        case 0:
          if (!(depth > MAX_DEPTH)) return [3 /*break*/, 2];
          return [4 /*yield*/, __await(void 0)];
        case 1:
          return [2 /*return*/, _a.sent()];
        case 2:
          _a.trys.push([2, 4, , 7]);
          return [
            4 /*yield*/,
            __await(
              node_fs_1.promises.readdir(node_path_1.default.join(ROOT, relDir), {
                withFileTypes: true,
              })
            ),
          ];
        case 3:
          dirents = _a.sent();
          return [3 /*break*/, 7];
        case 4:
          err_1 = _a.sent();
          if (!(err_1.code === 'ENOENT')) return [3 /*break*/, 6];
          return [4 /*yield*/, __await(void 0)];
        case 5:
          return [2 /*return*/, _a.sent()];
        case 6:
          throw err_1;
        case 7:
          ((_i = 0), (dirents_1 = dirents));
          _a.label = 8;
        case 8:
          if (!(_i < dirents_1.length)) return [3 /*break*/, 15];
          dirent = dirents_1[_i];
          if (dirent.name.startsWith('.') && dirent.name !== manifest_schema_ts_1.ENTRY_FILENAME)
            return [3 /*break*/, 14];
          rel = relDir ? (0, manifest_schema_ts_1.joinPosix)(relDir, dirent.name) : dirent.name;
          if (!dirent.isDirectory()) return [3 /*break*/, 11];
          if (IGNORED_DIRS.has(dirent.name)) return [3 /*break*/, 14];
          return [
            5 /*yield**/,
            __values(__asyncDelegator(__asyncValues(findEntryFiles(rel, depth + 1)))),
          ];
        case 9:
          return [4 /*yield*/, __await.apply(void 0, [_a.sent()])];
        case 10:
          _a.sent();
          return [3 /*break*/, 14];
        case 11:
          if (!(dirent.isFile() && dirent.name === manifest_schema_ts_1.ENTRY_FILENAME))
            return [3 /*break*/, 14];
          return [4 /*yield*/, __await(rel)];
        case 12:
          return [4 /*yield*/, _a.sent()];
        case 13:
          _a.sent();
          _a.label = 14;
        case 14:
          _i++;
          return [3 /*break*/, 8];
        case 15:
          return [2 /*return*/];
      }
    });
  });
}
function exists(rel) {
  return __awaiter(this, void 0, void 0, function () {
    var _a;
    return __generator(this, function (_b) {
      switch (_b.label) {
        case 0:
          _b.trys.push([0, 2, , 3]);
          return [4 /*yield*/, node_fs_1.promises.access(node_path_1.default.join(ROOT, rel))];
        case 1:
          _b.sent();
          return [2 /*return*/, true];
        case 2:
          _a = _b.sent();
          return [2 /*return*/, false];
        case 3:
          return [2 /*return*/];
      }
    });
  });
}
/* ---------------------------------------------------------------- git */
var execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
function git() {
  var args = [];
  for (var _i = 0; _i < arguments.length; _i++) {
    args[_i] = arguments[_i];
  }
  return __awaiter(this, void 0, void 0, function () {
    var stdout, _a;
    return __generator(this, function (_b) {
      switch (_b.label) {
        case 0:
          _b.trys.push([0, 2, , 3]);
          return [
            4 /*yield*/,
            execFileAsync('git', args, { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 }),
          ];
        case 1:
          stdout = _b.sent().stdout;
          return [2 /*return*/, stdout];
        case 2:
          _a = _b.sent();
          return [2 /*return*/, null]; // git missing, not a repo, or command unsupported
        case 3:
          return [2 /*return*/];
      }
    });
  });
}
function readIfPresent(rel) {
  return __awaiter(this, void 0, void 0, function () {
    var _a;
    return __generator(this, function (_b) {
      switch (_b.label) {
        case 0:
          _b.trys.push([0, 2, , 3]);
          return [
            4 /*yield*/,
            node_fs_1.promises.readFile(node_path_1.default.join(ROOT, rel), 'utf8'),
          ];
        case 1:
          return [2 /*return*/, _b.sent()];
        case 2:
          _a = _b.sent();
          return [2 /*return*/, null];
        case 3:
          return [2 /*return*/];
      }
    });
  });
}
/**
 * Discover the outer repository plus every submodule checkout.
 *
 * Only *stable* facts are recorded — remote URL, checkout path, and the pinned
 * submodule gitlink. The outer repo's own HEAD is deliberately omitted because
 * it changes on every commit, which would leave `--check` permanently stale;
 * pass `--pin-head` when you really want it.
 *
 * Works without git installed too: `.gitmodules` plus a committed
 * `submodules.txt` (`--submodule-status=`) is enough.
 */
function loadGitContext() {
  return __awaiter(this, void 0, void 0, function () {
    var remote,
      headCommit,
      _a,
      rawBranch,
      _b,
      headBranch,
      root,
      modules,
      _c,
      statusText,
      _d,
      status,
      submodules,
      _i,
      modules_1,
      mod,
      st,
      _e,
      _f,
      st;
    var _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
    return __generator(this, function (_s) {
      switch (_s.label) {
        case 0:
          if (!GIT) return [2 /*return*/, { submodules: [] }];
          return [4 /*yield*/, git('config', '--get', 'remote.'.concat(GIT_REMOTE, '.url'))];
        case 1:
          remote =
            (_h = (_g = _s.sent()) === null || _g === void 0 ? void 0 : _g.trim()) !== null &&
            _h !== void 0
              ? _h
              : '';
          if (!PIN_HEAD) return [3 /*break*/, 3];
          return [4 /*yield*/, git('rev-parse', 'HEAD')];
        case 2:
          _a =
            (_k = (_j = _s.sent()) === null || _j === void 0 ? void 0 : _j.trim()) !== null &&
            _k !== void 0
              ? _k
              : '';
          return [3 /*break*/, 4];
        case 3:
          _a = '';
          _s.label = 4;
        case 4:
          headCommit = _a;
          if (!PIN_HEAD) return [3 /*break*/, 6];
          return [4 /*yield*/, git('rev-parse', '--abbrev-ref', 'HEAD')];
        case 5:
          _b =
            (_m = (_l = _s.sent()) === null || _l === void 0 ? void 0 : _l.trim()) !== null &&
            _m !== void 0
              ? _m
              : '';
          return [3 /*break*/, 7];
        case 6:
          _b = '';
          _s.label = 7;
        case 7:
          rawBranch = _b;
          headBranch = rawBranch === 'HEAD' ? '' : rawBranch;
          root =
            remote || headCommit
              ? (0, manifest_schema_ts_1.makeRepoInfo)({
                  remote: remote,
                  commit: headCommit,
                  branch: headBranch,
                })
              : undefined;
          _c = manifest_schema_ts_1.parseGitmodules;
          return [4 /*yield*/, readIfPresent('.gitmodules')];
        case 8:
          modules = _c.apply(void 0, [(_o = _s.sent()) !== null && _o !== void 0 ? _o : '']);
          return [4 /*yield*/, git('submodule', 'status', '--recursive')];
        case 9:
          if (!((_p = _s.sent()) !== null && _p !== void 0)) return [3 /*break*/, 10];
          _d = _p;
          return [3 /*break*/, 12];
        case 10:
          return [4 /*yield*/, readIfPresent(STATUS_FILE)];
        case 11:
          _d = _s.sent();
          _s.label = 12;
        case 12:
          statusText = (_q = _d) !== null && _q !== void 0 ? _q : '';
          status = new Map(
            (0, manifest_schema_ts_1.parseSubmoduleStatus)(statusText).map(function (s) {
              return [s.path, s];
            })
          );
          submodules = [];
          for (_i = 0, modules_1 = modules; _i < modules_1.length; _i++) {
            mod = modules_1[_i];
            st = status.get(mod.path);
            status.delete(mod.path);
            submodules.push({
              path: mod.path,
              // Without any status source we cannot judge initialization: assume fine.
              state:
                (_r = st === null || st === void 0 ? void 0 : st.state) !== null && _r !== void 0
                  ? _r
                  : statusText
                    ? '-'
                    : ' ',
              info: (0, manifest_schema_ts_1.makeRepoInfo)({
                remote: mod.url,
                base: remote,
                path: mod.path,
                commit: st === null || st === void 0 ? void 0 : st.commit,
                // `branch = .` means "track the superproject's branch".
                branch: mod.branch === '.' ? headBranch : mod.branch,
                submodule: true,
              }),
            });
          }
          // Checkouts git knows about that `.gitmodules` does not (nested or stale).
          for (_e = 0, _f = status.values(); _e < _f.length; _e++) {
            st = _f[_e];
            submodules.push({
              path: st.path,
              state: st.state,
              info: (0, manifest_schema_ts_1.makeRepoInfo)({
                path: st.path,
                commit: st.commit,
                submodule: true,
              }),
            });
          }
          submodules.sort(function (a, b) {
            return a.path.localeCompare(b.path);
          });
          if (!root && !submodules.length)
            log('  note     no git metadata found; entries will have no repo');
          else
            log(
              '  git      '
                .concat(submodules.length, ' submodule(s)')
                .concat(
                  (root === null || root === void 0 ? void 0 : root.url)
                    ? ' under '.concat(root.url)
                    : ''
                )
            );
          return [2 /*return*/, { root: root, submodules: submodules }];
      }
    });
  });
}
/** Which repository owns `dir`? Longest matching submodule wins, else the root. */
function repoForDir(dir, ctx, source, warnings, warned) {
  var match = (0, manifest_schema_ts_1.matchRepoPath)(
    dir,
    ctx.submodules.map(function (s) {
      return s.path;
    })
  );
  if (match) {
    var sub = ctx.submodules.find(function (s) {
      return s.path === match;
    });
    if (sub.state === '-' && !warned.has(sub.path)) {
      warned.add(sub.path);
      warnings.push(
        ''
          .concat(source, ': submodule "')
          .concat(sub.path, '" is not initialized \u2014 commit pin may be stale')
      );
    }
    var rel = (0, manifest_schema_ts_1.relativeUnder)(sub.path, dir);
    return (0, manifest_schema_ts_1.mergeRepoInfo)(rel ? { subpath: rel } : undefined, sub.info);
  }
  if (!ctx.root) return undefined;
  return (0, manifest_schema_ts_1.mergeRepoInfo)(dir ? { subpath: dir } : undefined, ctx.root);
}
function loadEntries(gitContext) {
  return __awaiter(this, void 0, void 0, function () {
    var entries,
      errors,
      warnings,
      seenIds,
      warnedRepos,
      discovered,
      _i,
      ROOTS_1,
      root,
      _a,
      _b,
      _c,
      rel,
      e_1_1,
      sources,
      _loop_1,
      _d,
      sources_1,
      source;
    var _e, e_1, _f, _g;
    var _h, _j, _k;
    return __generator(this, function (_l) {
      switch (_l.label) {
        case 0:
          entries = [];
          errors = [];
          warnings = [];
          seenIds = new Map();
          warnedRepos = new Set();
          discovered = new Set();
          ((_i = 0), (ROOTS_1 = ROOTS));
          _l.label = 1;
        case 1:
          if (!(_i < ROOTS_1.length)) return [3 /*break*/, 14];
          root = ROOTS_1[_i];
          _l.label = 2;
        case 2:
          _l.trys.push([2, 7, 8, 13]);
          ((_a = true), (_b = ((e_1 = void 0), __asyncValues(findEntryFiles(root)))));
          _l.label = 3;
        case 3:
          return [4 /*yield*/, _b.next()];
        case 4:
          if (!((_c = _l.sent()), (_e = _c.done), !_e)) return [3 /*break*/, 6];
          _g = _c.value;
          _a = false;
          rel = _g;
          discovered.add(rel);
          _l.label = 5;
        case 5:
          _a = true;
          return [3 /*break*/, 3];
        case 6:
          return [3 /*break*/, 13];
        case 7:
          e_1_1 = _l.sent();
          e_1 = { error: e_1_1 };
          return [3 /*break*/, 13];
        case 8:
          _l.trys.push([8, , 11, 12]);
          if (!(!_a && !_e && (_f = _b.return))) return [3 /*break*/, 10];
          return [4 /*yield*/, _f.call(_b)];
        case 9:
          _l.sent();
          _l.label = 10;
        case 10:
          return [3 /*break*/, 12];
        case 11:
          if (e_1) throw e_1.error;
          return [7 /*endfinally*/];
        case 12:
          return [7 /*endfinally*/];
        case 13:
          _i++;
          return [3 /*break*/, 1];
        case 14:
          sources = __spreadArray([], discovered, true).sort();
          log(
            '  scan     '
              .concat(sources.length, ' ')
              .concat(manifest_schema_ts_1.ENTRY_FILENAME, ' file(s) under ') +
              ''
                .concat(
                  ROOTS.map(function (r) {
                    return r || '.';
                  }).join(', '),
                  ' (max depth '
                )
                .concat(MAX_DEPTH, ')')
          );
          _loop_1 = function (source) {
            var raw,
              _m,
              _o,
              err_2,
              problems,
              file,
              dir,
              category,
              legacy,
              previous,
              repo,
              entry,
              resolved,
              _p,
              _q,
              _r,
              field,
              value,
              clean;
            return __generator(this, function (_s) {
              switch (_s.label) {
                case 0:
                  raw = void 0;
                  _s.label = 1;
                case 1:
                  _s.trys.push([1, 3, , 4]);
                  _o = (_m = JSON).parse;
                  return [
                    4 /*yield*/,
                    node_fs_1.promises.readFile(node_path_1.default.join(ROOT, source), 'utf8'),
                  ];
                case 2:
                  raw = _o.apply(_m, [_s.sent()]);
                  return [3 /*break*/, 4];
                case 3:
                  err_2 = _s.sent();
                  errors.push(''.concat(source, ': invalid JSON \u2014 ').concat(err_2.message));
                  return [2 /*return*/, 'continue'];
                case 4:
                  problems = (0, manifest_schema_ts_1.validateEntryFile)(raw, source);
                  if (problems.length) {
                    errors.push.apply(errors, problems);
                    return [2 /*return*/, 'continue'];
                  }
                  file = raw;
                  dir = node_path_1.default.posix.dirname(source);
                  category = file.category;
                  legacy = manifest_schema_ts_1.LEGACY_SOURCES.find(function (s) {
                    return s.category === category;
                  });
                  previous = seenIds.get(file.id);
                  if (previous) {
                    errors.push(
                      ''
                        .concat(source, ': duplicate id "')
                        .concat(file.id, '" (also in ')
                        .concat(previous, ')')
                    );
                    return [2 /*return*/, 'continue'];
                  }
                  seenIds.set(file.id, source);
                  if (file.hidden && !INCLUDE_HIDDEN) {
                    log('  hidden   '.concat(source));
                    return [2 /*return*/, 'continue'];
                  }
                  repo = (0, manifest_schema_ts_1.mergeRepoInfo)(
                    (0, manifest_schema_ts_1.normalizeRepoRef)(file.repo),
                    repoForDir(dir, gitContext, source, warnings, warnedRepos)
                  );
                  entry = (0, manifest_schema_ts_1.orderKeys)(
                    __assign(__assign({}, file), {
                      section:
                        (_j =
                          (_h = file.section) !== null && _h !== void 0
                            ? _h
                            : legacy === null || legacy === void 0
                              ? void 0
                              : legacy.defaultSection) !== null && _j !== void 0
                          ? _j
                          : category,
                      order:
                        (_k = file.order) !== null && _k !== void 0 ? _k : Number.MAX_SAFE_INTEGER,
                      repo: repo,
                      dir: dir,
                      source: source,
                    }),
                    __spreadArray(
                      __spreadArray([], manifest_schema_ts_1.ENTRY_KEY_ORDER, true),
                      ['dir', 'source'],
                      false
                    )
                  );
                  if (!VERIFY) return [3 /*break*/, 8];
                  resolved = (0, manifest_schema_ts_1.resolveEntryPaths)(entry, dir);
                  ((_p = 0),
                    (_q = Object.entries({
                      href: resolved.href,
                      readme: resolved.readme,
                      video: resolved.video,
                    })));
                  _s.label = 5;
                case 5:
                  if (!(_p < _q.length)) return [3 /*break*/, 8];
                  ((_r = _q[_p]), (field = _r[0]), (value = _r[1]));
                  if (!value || (0, manifest_schema_ts_1.isExternal)(value))
                    return [3 /*break*/, 7];
                  clean = value.split(/[?#]/)[0];
                  return [4 /*yield*/, exists(clean)];
                case 6:
                  if (!_s.sent())
                    warnings.push(
                      ''
                        .concat(source, ': ')
                        .concat(field, ' points at missing file "')
                        .concat(clean, '"')
                    );
                  _s.label = 7;
                case 7:
                  _p++;
                  return [3 /*break*/, 5];
                case 8:
                  entries.push(entry);
                  return [2 /*return*/];
              }
            });
          };
          ((_d = 0), (sources_1 = sources));
          _l.label = 15;
        case 15:
          if (!(_d < sources_1.length)) return [3 /*break*/, 18];
          source = sources_1[_d];
          return [5 /*yield**/, _loop_1(source)];
        case 16:
          _l.sent();
          _l.label = 17;
        case 17:
          _d++;
          return [3 /*break*/, 15];
        case 18:
          entries.sort(manifest_schema_ts_1.compareEntries);
          return [2 /*return*/, { entries: entries, errors: errors, warnings: warnings }];
      }
    });
  });
}
/* -------------------------------------------------------------- write */
var outputs = new Map();
function queue(rel, contents) {
  outputs.set(rel, contents);
}
function flush() {
  return __awaiter(this, void 0, void 0, function () {
    var drift, _i, outputs_1, _a, rel, contents, absolute, current, _b;
    return __generator(this, function (_c) {
      switch (_c.label) {
        case 0:
          drift = false;
          ((_i = 0), (outputs_1 = outputs));
          _c.label = 1;
        case 1:
          if (!(_i < outputs_1.length)) return [3 /*break*/, 9];
          ((_a = outputs_1[_i]), (rel = _a[0]), (contents = _a[1]));
          absolute = node_path_1.default.join(ROOT, rel);
          current = null;
          _c.label = 2;
        case 2:
          _c.trys.push([2, 4, , 5]);
          return [4 /*yield*/, node_fs_1.promises.readFile(absolute, 'utf8')];
        case 3:
          current = _c.sent();
          return [3 /*break*/, 5];
        case 4:
          _b = _c.sent();
          return [3 /*break*/, 5];
        case 5:
          if (current === contents) {
            log('  ok       '.concat(rel));
            return [3 /*break*/, 8];
          }
          drift = true;
          if (CHECK) {
            console.error('  DRIFT    '.concat(rel));
            return [3 /*break*/, 8];
          }
          return [
            4 /*yield*/,
            node_fs_1.promises.mkdir(node_path_1.default.dirname(absolute), { recursive: true }),
          ];
        case 6:
          _c.sent();
          return [4 /*yield*/, node_fs_1.promises.writeFile(absolute, contents, 'utf8')];
        case 7:
          _c.sent();
          log('  '.concat(current === null ? 'create' : 'update', '   ').concat(rel));
          _c.label = 8;
        case 8:
          _i++;
          return [3 /*break*/, 1];
        case 9:
          return [2 /*return*/, drift];
      }
    });
  });
}
/* ---------------------------------------------------------------- main */
function main() {
  return __awaiter(this, void 0, void 0, function () {
    var gitContext,
      _a,
      entries,
      errors,
      warnings,
      _i,
      errors_1,
      e,
      counts,
      _b,
      entries_1,
      e,
      manifest,
      previous,
      old,
      sameBody,
      _loop_2,
      _c,
      LEGACY_SOURCES_1,
      source,
      drift,
      _d,
      warnings_1,
      w,
      summary,
      repos,
      repoNote;
    var _e, _f;
    var _g;
    return __generator(this, function (_h) {
      switch (_h.label) {
        case 0:
          return [4 /*yield*/, loadGitContext()];
        case 1:
          gitContext = _h.sent();
          return [4 /*yield*/, loadEntries(gitContext)];
        case 2:
          ((_a = _h.sent()),
            (entries = _a.entries),
            (errors = _a.errors),
            (warnings = _a.warnings));
          if (errors.length) {
            console.error('build-manifest: validation failed\n');
            for (_i = 0, errors_1 = errors; _i < errors_1.length; _i++) {
              e = errors_1[_i];
              console.error('  x '.concat(e));
            }
            node_process_1.default.exitCode = 1;
            return [2 /*return*/];
          }
          counts = {};
          for (_b = 0, entries_1 = entries; _b < entries_1.length; _b++) {
            e = entries_1[_b];
            counts[e.category] = ((_e = counts[e.category]) !== null && _e !== void 0 ? _e : 0) + 1;
          }
          manifest = {
            version: manifest_schema_ts_1.MANIFEST_VERSION,
            // Deterministic output: reuse the previous timestamp when nothing else moved.
            generatedAt: new Date().toISOString(),
            counts: counts,
            entries: entries,
          };
          return [
            4 /*yield*/,
            node_fs_1.promises
              .readFile(node_path_1.default.join(ROOT, OUT), 'utf8')
              .catch(function () {
                return null;
              }),
          ];
        case 3:
          previous = _h.sent();
          if (previous) {
            try {
              old = JSON.parse(previous);
              sameBody =
                JSON.stringify(__assign(__assign({}, old), { generatedAt: '' })) ===
                JSON.stringify(__assign(__assign({}, manifest), { generatedAt: '' }));
              if (sameBody && typeof old.generatedAt === 'string')
                manifest.generatedAt = old.generatedAt;
            } catch (/* regenerate wholesale */ _j) {
              /* regenerate wholesale */
            }
          }
          queue(OUT, (0, manifest_schema_ts_1.serializeJson)(manifest));
          if (WRITE_LEGACY) {
            _loop_2 = function (source) {
              var doc = {};
              for (var _k = 0, _l = source.sections; _k < _l.length; _k++) {
                var section = _l[_k];
                doc[section] = [];
              }
              for (
                var _m = 0,
                  _o = entries.filter(function (e) {
                    return e.category === source.category;
                  });
                _m < _o.length;
                _m++
              ) {
                var entry = _o[_m];
                ((_f = doc[(_g = entry.section)]) !== null && _f !== void 0
                  ? _f
                  : (doc[_g] = [])
                ).push((0, manifest_schema_ts_1.toLegacyEntry)(entry));
              }
              queue(source.file, (0, manifest_schema_ts_1.serializeJson)(doc));
            };
            for (
              _c = 0, LEGACY_SOURCES_1 = manifest_schema_ts_1.LEGACY_SOURCES;
              _c < LEGACY_SOURCES_1.length;
              _c++
            ) {
              source = LEGACY_SOURCES_1[_c];
              _loop_2(source);
            }
          }
          return [4 /*yield*/, flush()];
        case 4:
          drift = _h.sent();
          if (warnings.length) {
            console.warn('\nwarnings:');
            for (_d = 0, warnings_1 = warnings; _d < warnings_1.length; _d++) {
              w = warnings_1[_d];
              console.warn('  ! '.concat(w));
            }
          }
          summary = Object.entries(counts)
            .map(function (_a) {
              var k = _a[0],
                v = _a[1];
              return ''
                .concat(v, ' ')
                .concat(k)
                .concat(v === 1 ? '' : 's');
            })
            .join(', ');
          repos = new Set(
            entries
              .map(function (e) {
                var _a, _b;
                return (
                  ((_a = e.repo) === null || _a === void 0 ? void 0 : _a.url) ||
                  ((_b = e.repo) === null || _b === void 0 ? void 0 : _b.path)
                );
              })
              .filter(Boolean)
          );
          repoNote = GIT
            ? ' across '.concat(repos.size, ' repo').concat(repos.size === 1 ? '' : 's')
            : '';
          console.log(
            '\nbuild-manifest: '
              .concat(entries.length, ' entries (')
              .concat(summary, ')')
              .concat(repoNote, ' \u2192 ')
              .concat(OUT)
          );
          if (CHECK && drift) {
            console.error('build-manifest --check: output is stale, re-run without --check');
            node_process_1.default.exitCode = 1;
          }
          return [2 /*return*/];
      }
    });
  });
}
main().catch(function (err) {
  console.error('build-manifest failed: '.concat(err.message));
  node_process_1.default.exitCode = 1;
});
