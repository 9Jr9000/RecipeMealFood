# Recipe Box

A recipe manager and grocery list that stay in sync, laid out like Paprika and Deglaze.
It ships with no recipes and never suggests any. Everything you see is something you added.

## Features

- **Recipes**: a photo grid with search, categories and sorting. Each recipe has a photo, rating, servings, prep and cook time, source, ingredients (with section headings), directions and notes. You can scale ingredients, tap an ingredient to cross it off, and tap a step to mark your place.
- **Sections**: split ingredients into parts (e.g. Marinade / Sauce / Rice) with *Add Another Section*; each section has its own name and *+ Ingredient* button. Directions can be split the same way with a line ending in “:” (e.g. “For the sauce:”), and step numbers restart in each part. Sections are stored as heading lines, so they sync and work with the grocery list like everything else.
- **Paste to import**: paste a recipe copied from anywhere, and the name, ingredients, directions, servings and times are filled in for you to review.
- **Categories**: three groups — Meal (Breakfast, Lunch, Dinner, Snack, Dessert, Side Dish, Drinks), Protein (Chicken, Beef, Pork, Turkey, Seafood, Vegetarian) and Type (Pasta, Sandwiches & Burgers, Tacos & Mexican, Soups & Stews, Salads, Pizza, Rice & Bowls, Baking, Slow Cooker), plus your own. Filters combine across groups (e.g. Dinner + Chicken). New and imported recipes are categorized automatically from their name, ingredients and the website's own labels (`js/categories.js`); “Sort Automatically” does the same for recipes without categories.
- **Import from links**: the ⤓ button on Recipes takes one or many links (one per line) to recipe websites or TikTok videos. Websites are read from their built-in schema.org recipe data; TikTok recipes come from the video caption (via TikTok's oEmbed). Name, photo, ingredients, steps, servings and times are filled in, and the link is kept as the source. On Android, Recipe Box also appears in the Share menu. Pages are fetched through public CORS relays (`js/importer.js`), since browsers can't read other sites directly.
- **Grocery list**: grouped by aisle or by recipe. The same ingredient from different recipes (or typed in by you) is combined into one item with the amounts added up (e.g. `1 tbsp + 3 tsp` → `2 tbsp`).
- **Pantry**: what you have at home, optionally with how much.
- **Amount pickers**: amounts are entered as a number box + fraction dropdown (1/16 to ¾) + unit dropdown (tsp, tbsp, cup, oz, lb, g, ml…) for recipe ingredients, grocery items and pantry items. A **+** next to the amount adds a second measurement when a recipe needs one (e.g. ⅔ cup + ¼ tbsp); pasted text like `1 cup plus 2 tbsp flour` is understood too. Servings, prep/cook times and categories are dropdowns.
- **Unit conversion**: on a recipe, tap any measured amount to see it in cups, ounces, grams, tablespoons, teaspoons or milliliters, or use *Show amounts in* to switch them all. Conversions follow the kitchen chart 1 c = 8 oz = 229 g = 16 tbsp = 48 tsp = 240 ml (grams are a water-weight approximation).

## Look

A Y2K "console chrome" theme: brushed-periwinkle beveled panels, a carbon navigation layer with a halftone dot texture and gold menu words, circuit-board banners tinted per section, outlined box-art headings, and warm color reserved for actions (amber for tools, orange for forward/save). Arial throughout (Arimo / Archivo Black from Google Fonts where Arial isn't installed) with a pixel font for small labels.

## How the sync works

- Each ingredient on a recipe shows whether it is **in your pantry**, **not enough** (the pantry has less than the recipe needs), **on your grocery list**, or **needed**.
- If the pantry has an amount and a recipe needs more, only the difference is added to the list. Pantry items without an amount count as enough.
- *Add to Grocery List* preselects only what you need. Pantry items are left unchecked. Items another recipe already put on the list are preselected so their amounts combine. Items this recipe already added are left unchecked, so they aren't doubled.
- Checking items off moves them to **In Cart**. *Move to Pantry* then puts them in your pantry (adding the amounts you bought), so the next recipe knows you have them.
- Removing a recipe from the list (✕ on its chip), or deleting the recipe, removes its amounts and leaves the other recipes' amounts alone.
- If something on the list is added to the pantry, the list offers to remove it.
- Marking a pantry item *Used Up* offers to add it back to the grocery list.
- Matching ignores prep words and plurals (`2 large tomatoes, chopped` matches `tomato`). It also ignores descriptors like `kosher`/`unsalted` (`kosher salt` matches `salt`).
- An aisle you pick for an item is remembered.

## Sync across phones (optional)

Sign in under **Settings → Sync Across Devices** (Google or email + password) with the same account on
each phone. Recipes, photos, the grocery list, the pantry and aisle choices sync through Firebase
(Firestore), live, and changes made offline upload when the phone reconnects. Without signing in,
everything stays on the device as before.

Each item is merged separately: changes to different recipes/items on two phones both survive, an edit
made here wins over an older one from the cloud, and duplicates added on two phones (e.g. "milk") are
combined. The merge logic is in `js/cloudsync.js` (unit tested with two simulated phones in
`test/cloudsync.test.js`); the Firebase wiring is in `js/cloud.js`.

One-time Firebase setup (project `recipelog-99fe9`, config in `js/firebase-config.js`):

1. **Authentication → Sign-in method**: enable **Google** and **Email/Password**.
2. **Authentication → Settings → Authorized domains**: add `9jr9000.github.io`.
3. **Firestore Database → Create database** (production mode).
4. **Firestore Database → Rules**: paste the contents of [`firestore.rules`](firestore.rules) and **Publish**.
   These rules let each signed-in account read and write only its own data (`users/{uid}/...`).

The Firebase SDK is served from `js/vendor/firebase/` (see the README there) so sync works offline
and doesn't depend on a CDN.

## Running it

It's a static web app with no build step and no dependencies.

```sh
npm start            # serves at http://localhost:8080 (python3 -m http.server)
npm test             # unit tests for parsing and sync logic (Node 20+)
```

To use it on your phone, host the folder anywhere that serves static files over HTTPS (e.g. GitHub Pages). Then open it and choose **Add to Home Screen**. It runs full-screen and works offline.

Data is stored on the device (IndexedDB). Use **Settings → Export Backup** to save it or move it to another device.

## Code layout

- `js/ingredients.js`: parsing ingredient lines, name normalization, aisle guessing, and unit math
- `js/sync.js`: recipe, grocery list and pantry operations that keep everything consistent
- `js/app.js`: UI (views, sheets, routing)
- `js/db.js`: IndexedDB storage
- `sw.js`, `manifest.webmanifest`: offline support and installability
