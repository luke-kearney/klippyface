#ifndef KLIPPYFACE_FONT_TEXT_H
#define KLIPPYFACE_FONT_TEXT_H

#include <string>

// The built-in 5x7 font has one glyph per byte, laid out as code page 437
// (both drivers use the CP437 layout). Converts UTF-8 text to those bytes:
// ASCII passes through, characters the font has ("°", "±", "é") become their
// glyph, anything else becomes '?'. The Web UI preview does the same (render.ts).
std::string toFontText(const char* utf8);

#endif
