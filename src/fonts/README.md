# PDF fonts

## Arial Narrow (body text)

The PDF progress certification uses **Helvetica Bold** for titles and **Arial Narrow** for body text when the font is embedded.

To embed Arial Narrow:

1. **Option A – Liberation Sans Narrow (free, Arial Narrow–compatible)**  
   Download the TTF archive from [releases](https://github.com/liberationfonts/liberation-sans-narrow/releases) (e.g. `liberation-narrow-fonts-ttf-1.07.6.tar.gz`), extract it, then run:
   ```bash
   node scripts/embed-arial-narrow-font.js /path/to/LiberationSansNarrow-Regular.ttf
   ```
   Or pass the `.tar.gz` path; the script will extract the first TTF.

2. **Option B – Your own Arial Narrow TTF**  
   If you have a licensed Arial Narrow `.ttf` file:
   ```bash
   node scripts/embed-arial-narrow-font.js /path/to/ArialNarrow.ttf
   ```

This updates `arialNarrowBase64.ts` with the embedded font. If the file stays empty, the PDF falls back to Helvetica for body text.
