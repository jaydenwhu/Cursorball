# Cursor Ball

A ball that follows your cursor around your whole Mac desktop and rolls toward it. It lives in the menu bar, never blocks clicks, and remembers your settings.

## Try it

You need Node.js 18 or newer (https://nodejs.org).

```
cd CursorBall
npm install
npm start
```

A small ball icon appears in the menu bar and the ball rolls in from the left. Quit it from the menu bar icon.

## Make it a real Mac app

```
npm run package
```

This creates `dist/mac-arm64/Cursor Ball.app` on Apple Silicon, or `dist/mac/Cursor Ball.app` on an Intel Mac. Drag it into Applications.

The app is not notarized, so macOS may block the first launch. Right-click the app, choose Open, then confirm. If it says the app is damaged, run this once and open it again:

```
xattr -cr "/Applications/Cursor Ball.app"
```

## Settings window

Click the menu bar icon and choose Settings… (or press Cmd+, while the menu is open). You can set the ball's size in exact pixels, the follow speed from 1 to 10 (half steps allowed), the resolution, and turn on or off Stay beside cursor, Open at login and image background removal. Changes apply straight away and are saved automatically.

## Menu bar options

- Settings…
- Hide ball / Show ball
- Size: Small, Medium, Large, Huge
- Follow speed: Lazy, Normal, Snappy
- Resolution: Standard 1x, Sharp 2x, Ultra 4x
- Stay beside cursor: stops next to the pointer instead of under it
- Choose image: use your own picture as the ball (PNG, JPG, GIF, WebP or SVG)
- Remove image background: removes a flat grey or white background and centres the artwork
- Use built-in ball
- Open at login (available in the packaged app)
- Reset settings

## Saved settings

Every change is saved automatically to:

```
~/Library/Application Support/Cursor Ball/settings.json
```

Your chosen image is copied into the same folder, so it keeps working if you move or delete the original. Reset settings in the menu restores the defaults and removes the copied image.

## Using your own image

Choose a transparent PNG or an SVG for the cleanest result. A picture with a flat background also works if "Remove image background" is ticked. Pictures are only used at the size you set, so a larger source file looks sharper at Large and Huge.

## Notes

- The ball also appears on every connected display and over full-screen apps.
- It uses no special permissions, because it only reads the cursor position.
- Reading the cursor and drawing the ball is light on the CPU. When the ball is sitting still nothing is redrawn.
