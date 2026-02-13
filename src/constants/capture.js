export const CAPTURE_BLOCK_START = '// SM-CAPTURE-START';
export const CAPTURE_BLOCK_END = '// SM-CAPTURE-END';
export const CAPTURE_ITEM_START = '// SM-CAPTURE-ITEM-START';
export const CAPTURE_ITEM_END = '// SM-CAPTURE-ITEM-END';

export const CAPTURE_BLOCK_START_RGX = /^\s*\/\/\s*SM-CAPTURE-START\b/;
export const CAPTURE_BLOCK_END_RGX = /^\s*\/\/\s*SM-CAPTURE-END\b/;
export const CAPTURE_ITEM_START_RGX = /^\s*\/\/\s*SM-CAPTURE-ITEM-START\b/;
export const CAPTURE_ITEM_END_RGX = /^\s*\/\/\s*SM-CAPTURE-ITEM-END\b/;
export const CAPTURE_KEY_LINE_RGX = /key:\s*("(?:\\.|[^"])*")\s*,?\s*$/;
export const CAPTURE_NAME_LINE_RGX = /name:\s*("(?:\\.|[^"])*")\s*,?\s*$/;
