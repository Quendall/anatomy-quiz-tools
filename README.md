# Anatomy Quiz Tools

Learn and quiz yourself on human anatomy in 3D, in the browser.

**Live site:** https://quendall.github.io/anatomy-quiz-tools/

- **Explore**: turn body systems, groups and single structures on and off, select structures to label them, and use X-ray or isolate to see deeper parts. Lymph nodes can be drawn up to 4× their size, and hovering one lights up its whole group.
- **Learn**: the camera frames a highlighted structure. You start with 4 choices, then type the name once you know it. Missed structures come back sooner.
- **Flashcards**: flip between the 3D view and the name, star cards, and filter by starred.
- **Find**: you're given a name and click that structure in the 3D viewer.

Built for laptops: two-finger scroll orbits, pinch zooms, Shift + scroll pans, and a mouse wheel zooms. Progress and stars are saved in your browser; there are no accounts.

Systems: skeletal, joints & ligaments, muscular, cardiovascular, nervous system & sense organs, visceral, and lymphoid organs.

## Developing

Requires Node 20+.

```sh
npm install
npm run dev      # http://localhost:5173
npm run check    # type check
npm test         # quiz engine unit tests
npm run build    # static site in build/
```

The 3D models in `static/models/` are generated from Z-Anatomy FBX files by a headless Blender pipeline; see [tools/README.md](tools/README.md).

## Deploying

Every push to `main` runs [.github/workflows/deploy.yml](.github/workflows/deploy.yml), which checks, tests and builds the site with `BASE_PATH=/<repo-name>`, then publishes it to GitHub Pages.

## Credits and license

The code is licensed under the [MIT License](LICENSE).

3D models: [Z-Anatomy](https://github.com/LluisV/Z-Anatomy), licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The converted models in `static/models/` are adapted from Z-Anatomy and are shared under the same license.
