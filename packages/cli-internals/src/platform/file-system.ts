import * as nodeFs from "node:fs/promises"
import nodePath from "node:path"
import * as os from "node:os"
import * as PlatformError from "effect/PlatformError"
import { Effect, FileSystem, Layer, Option, Stream } from "effect"

/**
 * Node-backed `FileSystem` Layer.
 *
 * Implements the common methods (`readFile`, `writeFile`, `access`, `readDirectory`,
 * `makeDirectory`, `remove`, `stat`, `rename`, `symlink`, `link`, `chmod`, `chown`, `glob`,
 * `realPath`, `readLink`, `copy`, `copyFile`, `truncate`, `utimes`, `makeTempFile`,
 * `makeTempDirectory`) using `node:fs/promises`. The derived methods (`exists`,
 * `readFileString`, `writeFileString`, `stream`, `sink`) come for free from `FileSystem.make`.
 *
 * The complex methods (`open` returning a low-level File handle, `watch` returning a Stream of
 * watch events, the `*Scoped` temp helpers requiring Effect.Scope) are wired to `Effect.die`
 * with a clear "not implemented in projitect v0.1" message. The CLI flow doesn't exercise them;
 * if a future consumer needs them we'll fill them in.
 */

const sysError = (method: string, cause: unknown): PlatformError.PlatformError => {
  const message = cause instanceof Error ? cause.message : String(cause)
  const code = (cause as { code?: string }).code
  return PlatformError.systemError({
    _tag: code === "ENOENT" ? "NotFound" : code === "EACCES" ? "PermissionDenied" : "Unknown",
    module: "FileSystem",
    method,
    description: message,
  })
}

const tryEffect = <A>(
  method: string,
  p: () => Promise<A>,
): Effect.Effect<A, PlatformError.PlatformError> =>
  Effect.tryPromise({ try: p, catch: (e) => sysError(method, e) })

const dieNotImpl = <A>(method: string): Effect.Effect<A, PlatformError.PlatformError> =>
  Effect.die(
    new Error(
      `FileSystem.${method} is not implemented in projitect's Node Layer (v0.1). File an issue if you need it.`,
    ),
  )

const make = FileSystem.make({
  access: (path, options) =>
    tryEffect("access", () =>
      nodeFs.access(path, options?.readable === true ? nodeFs.constants.R_OK : undefined),
    ),
  copy: (fromPath, toPath, _options) =>
    tryEffect("copy", () => nodeFs.cp(fromPath, toPath, { recursive: true })),
  copyFile: (fromPath, toPath) => tryEffect("copyFile", () => nodeFs.copyFile(fromPath, toPath)),
  chmod: (path, mode) => tryEffect("chmod", () => nodeFs.chmod(path, mode)),
  chown: (path, uid, gid) => tryEffect("chown", () => nodeFs.chown(path, uid, gid)),
  glob: (pattern, options) =>
    tryEffect("glob", async () => {
      const paths: string[] = []
      for await (const path of nodeFs.glob(pattern, {
        cwd: options?.root,
        exclude: options?.exclude,
      })) {
        paths.push(path)
      }
      return paths
    }),
  link: (fromPath, toPath) => tryEffect("link", () => nodeFs.link(fromPath, toPath)),
  makeDirectory: (path, options) =>
    tryEffect("makeDirectory", () =>
      nodeFs.mkdir(path, { recursive: options?.recursive ?? false }).then(() => undefined),
    ),
  makeTempDirectory: (options) =>
    tryEffect("makeTempDirectory", () =>
      nodeFs.mkdtemp(nodePath.join(options?.directory ?? os.tmpdir(), options?.prefix ?? "pjt-")),
    ),
  makeTempDirectoryScoped: () => dieNotImpl("makeTempDirectoryScoped"),
  makeTempFile: (options) =>
    tryEffect("makeTempFile", async () => {
      const direction = await nodeFs.mkdtemp(
        nodePath.join(options?.directory ?? os.tmpdir(), options?.prefix ?? "pjt-"),
      )
      const file = nodePath.join(direction, "tmp")
      await nodeFs.writeFile(file, "")
      return file
    }),
  makeTempFileScoped: () => dieNotImpl("makeTempFileScoped"),
  open: () => dieNotImpl("open"),
  readDirectory: (path, _options) => tryEffect("readDirectory", () => nodeFs.readdir(path)),
  readFile: (path) =>
    tryEffect("readFile", async () => {
      const buf = await nodeFs.readFile(path)
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
    }),
  readLink: (path) => tryEffect("readLink", () => nodeFs.readlink(path)),
  realPath: (path) => tryEffect("realPath", () => nodeFs.realpath(path)),
  remove: (path, options) =>
    tryEffect("remove", () =>
      nodeFs.rm(path, { recursive: options?.recursive ?? false, force: options?.force ?? false }),
    ),
  rename: (oldPath, newPath) => tryEffect("rename", () => nodeFs.rename(oldPath, newPath)),
  stat: (path) =>
    tryEffect("stat", async () => {
      const s = await nodeFs.stat(path)
      const type = s.isFile()
        ? "File"
        : s.isDirectory()
          ? "Directory"
          : s.isSymbolicLink()
            ? "SymbolicLink"
            : "Other"
      return {
        type,
        mtime: Option.some(s.mtime),
        atime: Option.some(s.atime),
        birthtime: Option.some(s.birthtime),
        dev: s.dev,
        ino: Option.some(s.ino),
        mode: s.mode,
        nlink: Option.some(s.nlink),
        uid: Option.some(s.uid),
        gid: Option.some(s.gid),
        rdev: Option.some(s.rdev),
        size: FileSystem.Size(BigInt(s.size)),
        blksize: Option.some(FileSystem.Size(BigInt(s.blksize))),
        blocks: Option.some(s.blocks),
      } as FileSystem.File.Info
    }),
  symlink: (fromPath, toPath) => tryEffect("symlink", () => nodeFs.symlink(fromPath, toPath)),
  truncate: (path, length) =>
    tryEffect("truncate", () => nodeFs.truncate(path, length === undefined ? 0 : Number(length))),
  utimes: (path, atime, mtime) => tryEffect("utimes", () => nodeFs.utimes(path, atime, mtime)),
  watch: () =>
    Stream.die(
      new Error(
        "FileSystem.watch is not implemented in projitect's Node Layer (v0.1). File an issue if you need it.",
      ),
    ),
  writeFile: (path, data, _options) => tryEffect("writeFile", () => nodeFs.writeFile(path, data)),
})

export const FileSystemLive: Layer.Layer<FileSystem.FileSystem> = Layer.succeed(
  FileSystem.FileSystem,
  make,
)
