export type TourTab = 'room' | 'studio' | 'arrange' | 'vault';

export interface TourStep {
  id: string;
  /** `data-tour` value of the element to spotlight. Omit for a centered card. */
  target?: string;
  /** Module tab that must be open for the target to exist. */
  tab?: TourTab;
  /** Short chapter label shown above the title. */
  chapter: string;
  title: string;
  body: string;
  /** Optional "try this" hint shown under the body. */
  tryIt?: string;
}

/**
 * First-run walkthrough of the whole app, in the order a new bandmate
 * would naturally use it: set up → jam live → work async → organise.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    chapter: 'Welcome',
    title: 'Welcome to JamPod 🎶',
    body:
      'JamPod is your band’s practice room in the browser — no studio bookings, no rental fees, no scheduling headaches. There are no scores, streaks, or grades here. It’s just a place to play together.\n\nThis 2-minute guide walks you through every part of the app. You can replay it any time from the “Guide” button in the header.',
  },
  {
    id: 'room',
    target: 'brand',
    chapter: 'Getting set up',
    title: 'Your room',
    body: 'This is your band and its connection status. “online” means bandmates on any laptop or phone can join and see changes live. Click the logo or “⇦ rooms” to switch to another band.',
    tryIt: 'Click “🔗 invite” to copy an invite link with your band’s code. Bandmates who open it sign up or log in and join automatically (up to 4 per band).',
  },
  {
    id: 'profile',
    target: 'profile',
    chapter: 'Getting set up',
    title: 'Make your character yours',
    body: 'Open your profile to set the display name that floats over your station, pick a character style (masculine, feminine, or non-binary), choose a tint colour. They’re saved to your account. From here you can also switch rooms, leave a band, or log out.',
  },
  {
    id: 'theme',
    target: 'theme',
    chapter: 'Getting set up',
    title: 'Pick a look',
    body: 'Switch between Midnight Lounge (dark, candle-lit amber) and Oatmeal Studio (light, cream and sage). Your choice is remembered on this device.',
  },
  {
    id: 'tabs',
    target: 'tabs',
    chapter: 'Finding your way',
    title: 'Four rooms in one app',
    body:
      'Band Room — jam live together.\nSong Studio — record and mix parts on your own time.\nArrangement — sketch the song’s structure as a band.\nMusic Vault — your songs, versions, lyrics, charts, and setlists.',
  },
  {
    id: 'stage',
    target: 'stage',
    tab: 'room',
    chapter: 'Band Room · live jam',
    title: 'The stage',
    body: 'Each bandmate is a character at their instrument station. Name tags float above everyone, and the “YOU” label marks you. Characters walk between stations when someone swaps instruments.',
  },
  {
    id: 'swap',
    target: 'swap',
    tab: 'room',
    chapter: 'Band Room · live jam',
    title: 'Swap instruments any time',
    body: 'Pick Drums, Keys, Bass, or Guitar. Your character walks to that station, and whoever was there swaps to your old spot. Your microphone filter also re-tunes to suit the new instrument.',
    tryIt: 'Coloured dots show which bandmate is currently on each instrument.',
  },
  {
    id: 'whiteboard',
    target: 'whiteboard',
    tab: 'room',
    chapter: 'Band Room · live jam',
    title: 'Session goals whiteboard',
    body: 'Click the whiteboard on the studio wall to open the notepad. Add songs or goals for today, double-click to edit, reorder them, and tick them off. A marker line crosses each item out on every bandmate’s screen.',
  },
  {
    id: 'comm',
    target: 'comm',
    tab: 'room',
    chapter: 'Band Room · live jam',
    title: 'JAM ⇄ TALK',
    body:
      'The master switch for the whole room.\nJAM 🎸 — instruments lead, voices are gated, and the screen dims so the chord highway stands out.\nTALK 🗣️ — instruments and backing tracks duck down and voices are boosted so you can chat between takes.',
  },
  {
    id: 'led',
    target: 'led',
    tab: 'room',
    chapter: 'Band Room · live jam',
    title: 'Set the mood lighting',
    body: 'Slide the R, G, and B faders (and brightness) to repaint the studio’s walls, floor grid, and neon tubes for everyone. Or tap a preset: Lofi Sunset, Rock Arena, or Acoustic Warmth.',
  },
  {
    id: 'media',
    target: 'media',
    tab: 'room',
    chapter: 'Band Room · live jam',
    title: 'Bring a backing track',
    body: 'Drop in an MP3 and JamPod listens to it on your computer to work out the chords and tempo. Nothing is uploaded. Or paste a YouTube link and type the progression (e.g. “Am F C G”).',
    tryIt: 'Press Play here and everyone in the room plays along in sync.',
  },
  {
    id: 'highway',
    target: 'highway',
    tab: 'room',
    chapter: 'Band Room · live jam',
    title: 'The chord highway',
    body: 'Chords scroll from right to left and hit the white “now” line on the beat. The big letter is the chord to play right now, with the next one shown on the right. With no track loaded, it shows the chord it hears from your mic.',
  },
  {
    id: 'vocal',
    target: 'vocal',
    tab: 'room',
    chapter: 'Band Room · live jam',
    title: 'Mic & singing mode',
    body: 'Click “Enable microphone” to plug in. JamPod splits your mic into two paths: your instrument for chord detection, and a clean voice channel for the band. Turn on Singing mode and a vintage mic appears in front of your character, glowing with your voice.',
    tryIt: 'Your browser will ask for mic permission the first time.',
  },
  {
    id: 'video',
    target: 'video',
    tab: 'room',
    chapter: 'Band Room · live jam',
    title: 'See your bandmates',
    body: 'Your camera tile is at the top. Press “📷 On” to show your face. Bandmate tiles show their character until their video connects, with “LIVE” on anyone who’s online, and the little bars light up when they’re singing.',
  },
  {
    id: 'companion',
    target: 'companion',
    tab: 'room',
    chapter: 'Band Room · live jam',
    title: 'Use your phone as a talk mic',
    body: 'Is your laptop input taken by an electronic kit or guitar line-in? Click “Link phone” and scan the QR code. Your phone becomes a wireless talk mic that mutes itself in JAM and goes live in TALK, with no cable swapping.',
  },
  {
    id: 'feed',
    target: 'feed',
    tab: 'room',
    chapter: 'Band Room · live jam',
    title: 'Session feed',
    body: 'A running log of what’s happening: who swapped instruments, ticked a goal, loaded a track, or published a recording. Use the filters to narrow it down.',
  },
  {
    id: 'studio-transport',
    target: 'studio-transport',
    tab: 'studio',
    chapter: 'Song Studio · on your own time',
    title: 'The song blueprint',
    body: 'Can’t all meet today? Build the song in layers. Pick a song and version at the top, press Play to hear every part together, and click a coloured section (Intro, Verse, Chorus, Outro) to jump there.',
  },
  {
    id: 'studio-lanes',
    target: 'studio-lanes',
    tab: 'studio',
    chapter: 'Song Studio · on your own time',
    title: 'Record, trim, mix, publish',
    body:
      '1. Hit “Record Layer” on a track. The rest of the band plays so you can play along. Hit ■ to stop.\n2. Drag the brackets at either end of the waveform to trim.\n3. Shape the sound with the Gain fader, Low/Mid/High knobs (double-click to reset), and Verb.\n4. Press “Publish to Blueprint” to share it with the band.',
    tryIt: 'Use “M” to mute a track, and “Save as version” to keep a new take without losing the old one.',
  },
  {
    id: 'arrange',
    target: 'arrange-grid',
    tab: 'arrange',
    chapter: 'Arrangement · shape the song',
    title: 'Sketch the structure together',
    body: 'Each card is a section of the song. Drag cards to reorder, ⧉ to duplicate a chorus, 📌 to pin settled parts, and 👍 the ideas you like. Add new sections from the row above, or drag a card onto that row to remove it.',
  },
  {
    id: 'vault-tree',
    target: 'vault-main',
    tab: 'vault',
    chapter: 'Music Vault · your catalogue',
    title: 'Every version, kept',
    body: 'Each song keeps a family tree of its versions, like “Acoustic Demo v1” → “Full Track Demo v2” → “Studio Mix Master”. Click one and “Open in Studio” to hear those exact parts. Switch to “Teleprompter hub” for lyrics, chord charts, and sheet music. Use 🔓 Lock to pin it under the stage.',
  },
  {
    id: 'vault-setlists',
    target: 'vault-setlists',
    tab: 'vault',
    chapter: 'Music Vault · your catalogue',
    title: 'Build setlists',
    body: 'Drag songs from the library into folders like “Setlist for Live Gig”, and drag to reorder. “Load session” pre-loads every song so you can step through the set back-to-back from the Song Studio.',
  },
  {
    id: 'done',
    tab: 'room',
    chapter: 'You’re ready',
    title: 'That’s the whole studio 🎸',
    body:
      'A good first session:\n1. Set your name and character in your profile.\n2. Add today’s goals on the whiteboard.\n3. Drop in a backing track and jam along to the chord highway.\n4. Switch to TALK between songs.\n\nReplay this guide any time from the “Guide” button in the header. Have fun, and no pressure.',
  },
];
