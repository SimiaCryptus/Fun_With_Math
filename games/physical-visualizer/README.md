# Physical Visualizer

*A music visualizer you can hold in your hand — and tilt, shake, and set down.*

---

## What it is

Physical Visualizer turns your phone into a small, glowing instrument. Play a song,
and the screen fills with swirling, feedback-heavy imagery that pulses on every
kick drum. Then tilt the phone: the glitter on screen slides downhill and pools in
the low corner, as though the pixels actually weigh something. Shake it, and the
current pattern shatters into the next one.

It lives entirely inside your web browser. There is nothing to download from an
app store, no account to make, and no server it talks to. Open the page once, and
it keeps working afterwards even with no internet connection. If you like, you can
add it to your home screen and it behaves like an ordinary app.

Wrapped around all of this is a deliberately retro control panel: the tiny,
pixel-exact chrome of a late-1990s desktop music player, complete with the little
green spectrum display, a scrolling song title, a ten-band equalizer, and a
playlist window. It looks like a relic. It is driven by very modern machinery.

---

## A little background

In 1997, a small program called Winamp changed how a generation listened to
music on computers. Its most beloved feature wasn't the playback — it was the
*visualizers*: plug-ins that took the sound coming out of your speakers and drew
something hypnotic to go with it. The most famous, Milkdrop, worked by feeding
each frame back into the next with a slight zoom, twist, and fade. The result was
an endlessly evolving bloom of colour that seemed to breathe with the music.

Winamp was also *skinnable*. People drew their own control panels — brushed metal,
alien spacecraft, cartoon characters — and shared them by the thousands. A skin
was a small zip file, and dropping one onto the player instantly re-dressed the
whole thing.

Two things have changed since then. First, browsers can now do what only
installed desktop software could do in 1997: read audio in real time, draw with
the graphics chip, and run offline. Second, the device in your pocket knows
which way is down. It has an accelerometer and a gyroscope. Winamp never had
those.

Physical Visualizer is what happens when you put those ideas together.

---

## The idea in one sentence

**Sound and motion are both just signals, so they can drive the same picture.**

Traditional visualizers listen to music and draw. This one listens to music *and*
to the physical state of the device — how it is tilted, how hard it was just
moved, whether it is lying flat on a table — and treats all of it as equal
input. Gravity is a real force in the simulation. Bass is a real force in the
simulation. They push on the same particles.

This is why tilting doesn't merely swing the "camera" around. In the *Gravity
Well* scene, thousands of sparks fall toward whichever edge of the phone is
lowest, pile up, and then get kicked into the air by each drum hit. In *Liquid
Sand*, tilting biases the flow of a two-dimensional fluid while the bass line
injects turbulence at the center. In *Tunnel of Love*, tilt steers you down a
neon corridor and a quick twist of the wrist rolls the horizon.

Even the retro control panel takes part: the windows float a few pixels above the
imagery and drift with the tilt of the device, like objects sitting on glass.

---

## How you use it

**Waking it up.** The first thing you see is a large plate reading
"▶ CLICK TO WAKE". Tapping it does two jobs at once: it switches on audio and it
asks your phone for permission to read its motion sensors. Phones require a
deliberate tap for both, which is why the app asks once, up front, rather than
nagging later. The plate also carries a plain-language warning about flashing
imagery — more on that below.

**Choosing what to hear.** You can:

- Open one or more audio files stored on your phone (the "📂" button, or just
  drag files onto the page on a desktop).
- Use the microphone ("🎤"), so the visuals react to whatever is playing in the
  room — a record player, a friend's speaker, a live band.
- Do nothing, and a short built-in loop plays so you can see it work immediately.

One honest limitation: music from streaming services is encrypted and cannot be
visualised by a web page. That is a rule of the platform, not a choice of this
project.

**Playing with it.**

| Do this               | And this happens                                                    |
|-----------------------|---------------------------------------------------------------------|
| Tilt the phone        | Particles, fluids and tunnels respond to "down"                     |
| Shake it              | The current scene shatters into the next one, with a small buzz     |
| Swipe left / right    | Previous / next scene                                               |
| Swipe up              | Fullscreen                                                          |
| Pinch                 | Strengthen or soften the feedback trails                            |
| Press and hold        | See the name and details of the current scene                       |
| Lay it flat on a table| After a few seconds the controls fade and it becomes a lava lamp    |
| Pick it back up       | The controls return                                                 |

If your phone won't share its motion sensors (or you're on a desktop), nothing
breaks: dragging a finger across the screen acts as a virtual tilt, springing
back to centre when you let go.

**The control panel.** The classic three-window layout — player, equalizer,
playlist — snaps together magnetically as you drag the windows around, exactly
like the original. Double-tapping a title bar collapses that window into a thin
strip. On a narrow phone screen the windows stack vertically instead, with the
visuals filling the whole background. The sprites stay small and authentic; the
invisible tap targets around them are made finger-sized.

Drop any Winamp `.wsz` skin file onto the page and the whole panel re-dresses
itself. As a small flourish, the visualizer can also borrow the skin's colour
palette, so changing skins can recolour the entire scene.

---

## Why it's interesting

**It makes the device part of the artwork.** Most phone apps treat the phone as
a window you look through. This treats it as a physical object with mass and
orientation — a snow globe, a bottle of glitter, a level. You find yourself
tilting it gently to pour light from one corner to the other.

**It's a small argument about what browsers can do now.** No install, no store,
no build tools, no server. A plain web page reads real-time audio, runs a
particle simulation on the graphics chip at sixty frames a second, reads the
gyroscope, and works on a plane. A decade ago, every one of those was a reason
to write a native app.

**It respects old craft.** The 1997 interface isn't a costume. It reproduces the
exact pixel dimensions, the bitmap fonts, the windowshade mode, the falling peak
dots on the little spectrum display, and it loads the same skin files people made
twenty-five years ago. Those files still work. That feels worth honouring.

**It is careful.** Feedback visualizers can flash, and flashing can hurt people.
The app constantly measures how bright the screen is and how quickly that
brightness changes. If it detects too many hard flashes in a short window, it
smooths the picture for a couple of seconds. Scenes cannot switch this off; they
can only be *gentler* than the limit. If your system is set to "reduce motion",
the app starts on a calm scene with camera shake and parallax disabled.

**It looks after your battery.** It measures its own frame rate and quietly
lowers the rendering resolution on slower phones rather than stuttering. When
the screen is hidden or the phone appears to be in a pocket, it throttles itself.

---

## Who might enjoy it

- **Anyone who misses Winamp.** If the phrase "it really whips the llama's ass"
  means something to you, this is a warm, slightly absurd homecoming — on a
  device that didn't exist then.

- **People who like ambient light.** Set the phone flat on a nightstand or a
  shelf, start some quiet music, and it becomes a slow, self-changing lava lamp
  that dims its controls and just glows.

- **Hosts and small-party DJs.** Point the microphone at the room, prop the phone
  against a wall or cast it to a TV, and there's a reactive backdrop for whatever
  is playing — no laptop, no software licence.

- **Musicians practising or performing.** The visuals react to a live instrument
  through the microphone, and the equalizer and spectrum display are functional,
  not decorative. It's a rough but genuine visual monitor.

- **Teachers and the curious.** It is a vivid, hands-on illustration of several
  ideas at once: what a frequency spectrum is, what an accelerometer measures,
  how feedback loops make complex patterns, and why a phone can tell which way
  is up. Tilting a device and watching "gravity" move on screen makes the
  abstract very concrete.

- **Skin collectors and tinkerers.** Thousands of community skins from the
  1990s and 2000s are still floating around online. This is a place to see them
  live again, on a phone, floating over something no desktop of the era could
  have drawn.

- **People with older or modest phones.** It is built to scale itself down
  gracefully rather than demand the latest hardware.

---

## Where it stands today

The core experience — audio analysis, beat detection, the feedback-driven
scenes, motion sensing, the gravity and tunnel scenes, offline installation, and
the safety guard — works. The faithful skinned control panel is the largest piece
still being finished; in the meantime a simpler set of buttons stands in for it.
A few scenes (notably *Liquid Sand*) and some polish such as bloom lighting are
still on the way.

It is a work in progress in the way a good hobby is a work in progress: usable
now, more delightful later.

---

## Things to know before you start

- **Flashing imagery.** The guard described above is always on, but if you are
  sensitive to flashing lights, please don't use it.
- **Motion sensors need a secure page and a tap.** If you open the page over an
  insecure connection or decline the permission, you get the finger-drag tilt
  instead. Everything else still works.
- **Streaming apps can't be visualised.** Use files you own or the microphone.
- **On iPhones, the ring/silent switch may mute playback.** If you hear nothing,
  check the switch on the side of the phone.
- **Your music stays on your device.** Files you open are kept in your browser's
  local storage only. Nothing is uploaded anywhere.