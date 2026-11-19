# Pip, your desktop parrot

Pip floats over all your windows. Hover over him to start a note.

## Run it

1. Install Node.js (https://nodejs.org, the LTS version).
2. Use Node.js 20 or newer and npm 10 or newer.
3. Unzip this folder, open a terminal inside it and run:

       npm install
       npm start

Pip appears in the bottom-right corner of your screen, and a small Pip icon appears in your system tray / menu bar.

## Using Pip

- Hover over Pip: he jumps, waves and offers a blank note.
- Drag Pip to move him: he flies in the direction you drag, and lands when you let go. He remembers where you left him.
- Pip follows your cursor with his eyes anywhere on screen, and falls asleep after 90 seconds without mouse movement.
- Right-click Pip, or use the tray icon, for: open my notes, hide Pip, start Pip when I log in, bring Pip to this screen, quit.
- Notes are saved on your computer in Pip's app data folder (notes.json).
- Drag the Notepad by its top bezel to reposition it, or drag the ridged handle in its lower-right corner to resize it. The notebook frame scales with the window. It supports rich-text notes, checkbox-formatted lists, search, and sorting. Checkbox lists are note formatting only; Pip's checklist/reminder feature remains removed. Existing checklist data is retained in `notes.json` but is inactive and not shown.

## Change Pip's size

Open `main.js` and change the two numbers at the top, then restart Pip:

    const SCALE = 0.7;     // Pip's size. 1 = original, 0.5 = half
    const UI_SCALE = 0.8;  // size of the buttons and speech bubble

## Make an installer (optional)

    npm run dist

The installer for your system appears in the `dist` folder.

For release builds, macOS signing and notarization credentials must be provided by your Apple Developer account, and Windows signing certificates must be configured in the electron-builder environment. The repository enables macOS hardened runtime but does not contain or bundle signing credentials.

## Run checks

- `npm run lint` checks application and test JavaScript with ESLint.
- `npm test` runs the fast Node.js unit tests.
- `npm run test:smoke` launches Electron, verifies the Notepad renderer initializes, and then exits. It requires a graphical desktop session; on headless Linux, run it under a virtual display such as Xvfb.

## Notes

- Windows and macOS: Pip's transparent area is click-through, so you can click windows behind him.
- Linux: the transparent area around Pip (280 x 420 px) catches clicks, and the tray icon needs a desktop that supports tray icons. "Start Pip when I log in" is hidden because Linux desktop environments do not provide one consistent startup mechanism.
