#!/usr/bin/env node
// Inline h3 CJS into main.js
import { readFileSync, writeFileSync } from 'fs'

const main = readFileSync('main.js', 'utf8')
const h3 = readFileSync('node_modules/h3/dist/index.cjs', 'utf8')
const h3iife = `(function(){var exports={};${h3}return exports;})()`

// Find and replace the h3 require in the combined let statement
// Pattern: let E=require("obsidian"),H=require("h3");
let bundled = main.replace(
  /(let (\w+)=require\("obsidian"\),)(\w+)=require\("h3"\);/,
  (_, prefix, obsVar, h3var) =>
    `${prefix}${h3var}=${h3iife};`
)

// Also handle standalone let H=require("h3");
bundled = bundled.replace(
  /(let (\w+)=require\("h3"\);)/,
  (_, stmt) => {
    const varName = stmt.match(/let (\w+)=/)?.[1]
    return `let ${varName}=${h3iife};`
  }
)

writeFileSync('main.js', bundled)
console.log('Done. Remaining h3 require:', bundled.includes('require("h3")'))
console.log('main.js size:', bundled.length)
