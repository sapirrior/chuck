# wit CLI Technical Command Specification (v4.1.0)

Authoritative Repository: [github.com/sapirrior/wit](https://github.com/sapirrior/wit)  
Issue Tracker: [github.com/sapirrior/wit/issues](https://github.com/sapirrior/wit/issues)

This document contains the low-level CLI command specifications, exit codes, and flag definitions for the `wit` tool.

---

## Command Routing & Verbs

The `wit` entrypoint routes commands based on the first argument (`args[1]`).

### 1. `wit snap <folder|url>` (Directory & Remote Packaging)
Packages a local folder or shallow-clones a remote Git repository into a snapshot archive or export file.
- **Syntax**: `wit snap <folder|url> [options]`
- **Fallback**: Running `wit <folder|url> [options]` also executes a snapshot.
- **Parameters**:
  - `-m` (string): Snapshot message, written to the `<wit message="...">` attribute.
  - `-o` (string): Custom destination path. Auto-appends `.wit.<format>` (`.wit.xml`, `.wit.md`, `.wit.txt`).
  - `-c`: Compresses the output into `<name>.wit.xml.zip`.
  - `--format <xml|json|md|txt>`: Selects output format. XML (default) and JSON support full round-trip; Markdown (`md`) and Text (`txt`) are export-only.
  - `--exclude <pattern>`: Excludes glob patterns (can be specified multiple times).
  - `--max-size <size>`: Ignores files exceeding size limit (B, KB, MB, GB).
  - `--no-tree`: Omit embedded ASCII directory tree.
  - `--allow-secrets`: Include files matching credential scanner rules.
  - `--no-secret-scan`: Disable secret scanning entirely.
  - `--no-tokens`: Skip post-snap token count display.
- **Ignore Rules**: Evaluates both `.gitignore` and `.witignore` files.
- **Exit Codes**:
  - `0`: Success.
  - `1`: Target not found, size limit error, clone failure, or write error.

### 2. `wit grab <archive>` (Workspace Reconstruction)
Rebuilds a directory tree from an XML archive. Automatically detects and decompresses `.zip` archives.
- **Syntax**: `wit grab <archive> [-o <destination_dir>] [-i]`
- **Parameters**:
  - `-o` (string): Rebuild output directory. Defaults to XML `root` attribute.
  - `-i`, `--interactive`: Prompt approval `[y/n/a/q]` before writing each file.
- **Exit Codes**:
  - `0`: Success.
  - `1`: Hash/size mismatches, invalid XML, or write failures.

### 3. `wit tokens <archive>` (Token Usage Analysis)
Streams an archive and computes per-file token counts using `cl100k_base` tiktoken encoding, displaying context window utilization (GPT-4o, Claude 3.5, Gemini 2.5 Pro).
- **Syntax**: `wit tokens <archive>`
- **Exit Codes**:
  - `0`: Success.
  - `1`: Archive not found or invalid XML.

### 4. `wit secrets <archive>` (Credential Leak Audit)
Scans text files in an archive for AWS keys, GitHub tokens, Slack tokens, private keys, passwords, and connection strings.
- **Syntax**: `wit secrets <archive>`
- **Exit Codes**:
  - `0`: Success (no secrets detected).
  - `1`: Secret(s) detected or file error.

### 5. `wit init` (Configuration Generator)
Scaffolds a `wit.toml` configuration file in the current directory.
- **Syntax**: `wit init`
- **Exit Codes**:
  - `0`: Success.
  - `1`: `wit.toml` already exists or write failure.

### 6. `wit verify <archive>` (Integrity Verification)
Validates all SHA-1 hashes and sizes in the archive without rebuilding files.
- **Syntax**: `wit verify <archive>`
- **Exit Codes**:
  - `0`: Success (all files match).
  - `1`: Integrity failure (hash or size mismatches).

### 7. `wit diff <archiveA> <archiveB>` (Snapshot Differencing)
Shows a unified diff of file changes, additions, removals, and image dimension differences between two wit snapshots.
- **Syntax**: `wit diff <archiveA> <archiveB>`

### 8. `wit list <archive>` (File List Printer)
Lists all files in the archive by identity hash and relative path. Use `-l` for detailed view.
- **Syntax**: `wit list <archive> [-l]`

### 9. `wit glance <archive> <identity>` (File Content Inspection)
Inspects a specific file inside the archive by its identity SHA-1 hash prefix.
- **Syntax**: `wit glance <archive> <identity>`

### 10. `wit patch <archive> [dest_folder]` (Partial Workspace Application)
Applies only changed or new files from the archive into the target folder.
- **Syntax**: `wit patch <archive> [dest_folder] [-i]`

### 11. `wit msg <archive>` & `wit meta <archive>`
Inspects commit message or metadata summary from an archive.
