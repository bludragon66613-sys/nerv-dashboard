#!/usr/bin/env node
// PostToolUse hook: records slash command usage to command-registry.json
// Fires when Bash tool is used with a slash command pattern

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'

const input = JSON.parse(readFileSync('/dev/stdin', 'utf-8'))
const cmd = input?.tool_input?.command || ''
if (!/^\/[a-z]/.test(cmd.trim())) process.exit(0)

const registryPath = process.env.AEON_REGISTRY_PATH ||
  (process.env.USERPROFILE || process.env.HOME) + '/aeon/dashboard/.cache/command-registry.json'

const commandName = cmd.trim().split(/\s+/)[0]
const category = commandName.split(':')[0].replace(/^\//, '')

let registry = { commands: {} }
try {
  if (existsSync(registryPath)) registry = JSON.parse(readFileSync(registryPath, 'utf-8'))
} catch { /* start fresh */ }

registry.commands[commandName] = {
  usage: ((registry.commands[commandName]?.usage) || 0) + 1,
  last_used: new Date().toISOString(),
  category,
}

mkdirSync(dirname(registryPath), { recursive: true })
writeFileSync(registryPath + '.tmp', JSON.stringify(registry, null, 2))
writeFileSync(registryPath, readFileSync(registryPath + '.tmp'))
import('fs').then(f => { try { f.unlinkSync(registryPath + '.tmp') } catch {} })
