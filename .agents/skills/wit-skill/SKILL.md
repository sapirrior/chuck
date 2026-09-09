---
name: wit-skill
description: Assists in generating, inspecting, and formatting valid, high-fidelity XML or JSON snapshot files for the wit CLI tool. Activate this skill when writing, validating, or editing a wit snapshot file.
---

# wit-skill — Technical Specification & AI Generation Rules

Authoritative Repository: [github.com/sapirrior/wit](https://github.com/sapirrior/wit)  
Raw Reference Docs: [raw.githubusercontent.com/sapirrior/wit/main/README.md](https://raw.githubusercontent.com/sapirrior/wit/main/README.md)

This skill contains the rigorous technical specifications, schema rules, and parser boundaries required to generate valid, rebuilt-compatible `wit` XML archives.

---

## 1. Symmetrical XML Schema Definition

All archives must strictly conform to the following XML structure. Deviations in tag names, attributes, or casing will trigger parser validation errors.

### Root Node: `<wit>`
The root tag wrapping the file database.
- **Attributes**:
  - `version` (string): Target release (e.g. `"4.0"`, `"4.0.0"`).
  - `created` (string): UTC timestamp formatted in ISO-8601/RFC3339 (`YYYY-MM-DDTHH:MM:SSZ`).
  - `root` (string): POSIX directory name of the target root.
  - `file_count` (int): Total count of child tags (excluding optional `<tree>`).
  - `message` (string, optional): XML-escaped custom description message.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<wit version="4.0" created="2026-08-06T12:00:00Z" root="app" file_count="4" message="Technical Commit">
  <tree><![CDATA[app/
├── cmd/
│   └── main.go
└── README.md]]></tree>
  <!-- Children tags -->
</wit>
```

### Children Nodes:
1. **Directory Tree (`<tree>`, optional)**:
   Contains ASCII directory tree representation inside CDATA.
2. **Regular Text File (`<file>`)**:
   Contains file content in a CDATA wrapper.
   - **Attributes**:
     - `path` (string): Relative destination path using POSIX forward slashes (`/`).
     - `identity` (string): 40-character lowercase hex SHA-1 digest of raw contents.
     - `mode` (string): Octal string representing permissions (e.g. `"0644"`, `"0755"`).
     - `size` (int): Total byte count of uncompressed content.
   - **Casing**: `<file path="..." identity="..." mode="..." size="...">`
3. **Binary File (`<binary>`)**:
   Contains base64 encoded data inside CDATA.
   - **Attributes**: Same as `<file>` plus:
     - `encoding` (string): Must be exactly `"base64"`.
   - **Casing**: `<binary path="..." identity="..." mode="..." size="..." encoding="base64">`
4. **Symbolic Link (`<symlink>`)**:
   Self-closing tag for symbolic links.
   - **Attributes**:
     - `path` (string): Destination path.
     - `target` (string): Path the link points to.
     - `mode` (string): Octal representation (usually `"0777"`).
   - **Casing**: `<symlink path="..." target="..." mode="0777"/>`
5. **Empty File (`<empty>`)**:
   Self-closing tag for zero-byte files.
   - **Attributes**:
     - `path` (string): Destination path.
     - `mode` (string): Octal representation.
   - **Casing**: `<empty path="..." mode="0644"/>`

---

## 2. Formatting Constraints (Strict Parser Requirements)

### ⚠️ Whitespace Sensitive CDATA
Go's `xml.Decoder` captures all character data inside a node. Do **not** format XML layout with newlines or indents around CDATA blocks.
- **Valid (100% correct)**:
  ```xml
  <file path="main.go" identity="d39a3..." mode="0644" size="52"><![CDATA[package main
func main() {}]]></file>
  ```
- **Invalid (will corrupt files with extra spaces/newlines)**:
  ```xml
  <file path="main.go" identity="d39a3..." mode="0644" size="52">
    <![CDATA[package main
func main() {}]]>
  </file>
  ```

### CDATA Escaping Rule
If a file's content contains the sequence `]]>`, escape it by splitting across CDATA blocks:
- Sequence: `]]>`
- Transformed: `]]]]><![CDATA[>`

---

## 3. Output Formats

`wit` supports three output formats via `--format`. Naming automatically enforces `.wit.<format>` extensions (`.wit.xml`, `.wit.md`, `.wit.txt`):
- **`xml` (default)**: Canonical XML schema described above (`.wit.xml`). Full round-trip support (`grab`, `patch`, `verify`).
- **`json`**: Structured JSON format (`.wit.json`). Full round-trip support (`grab`, `patch`, `verify`).
- **`md`**: GitHub-Flavored Markdown (`.wit.md`) with fenced code blocks and tree preamble. Export-only.
- **`txt`**: Plain text (`.wit.txt`) with `=== path ===` headers. Export-only.
