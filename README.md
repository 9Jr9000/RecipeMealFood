# Recipe Box

A recipe manager and grocery list that stay in sync, laid out like Paprika and Deglaze.
It ships with no recipes and never suggests any. Everything you see is something you added.

## Features

- **Recipes**: a photo grid with search, categories and sorting. Each recipe has a photo, rating, servings, prep and cook time, source, ingredients (with section headings), directions and notes. You can scale ingredients, tap an ingredient to cross it off, and tap a step to mark your place.
- **Sections**: split ingredients into parts (e.g. Marinade / Sauce / Rice) with *Add Another Section*; each section has its own name and *+ Ingredient* button. Directions can be split the same way with a line ending in “:” (e.g. “For the sauce:”), and step numbers restart in each part. Sections are stored as heading lines, so they sync and work with the grocery list like everything else.
- **Paste to import**: paste a recipe copied from anywhere, and the name, ingredients, directions, servings and times are filled in for you to review.
- **Categories**: five groups — Meal (Breakfast, Lunch, Dinner, Snack, Dessert, Side Dish, Drinks), Protein (Chicken, Beef, Pork, Turkey, Seafood, Vegetarian), Type (Pasta, Sandwiches & Burgers, Tacos & Burritos, Soups & Stews, Salads, Pizza, Rice & Bowls, Casseroles, Baking), Method (Air Fryer, Slow Cooker, Instant Pot, One Pot & Pan, Sheet Pan, Grilled, No Cook, Meal Prep, Freezer Friendly) and Cuisine (Mexican, Italian, Chinese, Japanese, Korean, Thai, Vietnamese, Indian, Mediterranean, Cajun & Southern), plus your own. Methods are also picked up from the directions and notes (“air fry at 400°F”, “freezes well”). Recipes saved under the old “Tacos & Mexican” are moved to “Tacos & Burritos” + “Mexican” automatically. Filters are dropdowns (one per group) and combine across groups (e.g. Dinner + Chicken); in the sidebar each group is a collapsible dropdown that remembers whether you left it open. New and imported recipes are categorized automatically from their name, ingredients and the website's own labels (`js/categories.js`); “Sort Automatically” does the same for recipes without categories.
- **Calories on cards**: each recipe card shows estimated calories per serving (or for the whole recipe when it has no servings), worked out in the background from the USDA data and remembered on the device until the ingredients or servings change. The recipe page shows calories, protein, carbs and fat per serving — tap it for the full Nutrition breakdown. Only shown when at least half the ingredients have amounts and a food match, so it isn't misleading. Sort by *Calories (Low to High)*, or turn it off in Settings → Recipe Cards (`js/calorie-cache.js`, `recipeCalories` in `js/health.js`).
- **Cook mode** (*Start Cooking* on a recipe): one big step at a time with Back/Next (or swipe, or ←/→ on a keyboard), the section it belongs to, and the ingredients that step uses (with amounts scaled to match the recipe page). The screen is kept on with the Screen Wake Lock API where the browser supports it. Times in a step (“bake 25–30 minutes”, “simmer 1 hour 15 minutes”) become tap-to-start timers; several can run at once and they stay in a tray at the bottom of every screen with pause, +1 minute and cancel. When one finishes it beeps, vibrates and flashes until you tap Stop; with notifications allowed it also sends a “Timer done” notification. Timers are based on the clock, so they stay correct if the app is closed or the phone sleeps — but phones (especially iPhones) pause web apps in the background, so the alarm sound may only play once you come back to the app. Text size: the **AA** button (`js/cookmode.js`, `js/cookmode-ui.js`).
- **Cook Together — less waste** (Plan tab → Cook Together, or *Cook With This* on a recipe page): groups 2–5 of your recipes so the groceries you buy get used up. Build around the least overall waste, an ingredient (e.g. ground beef) or one recipe. Amounts are compared with typical store sizes (1 lb of ground beef, a bunch of cilantro, a 16 oz tub of sour cream, a 32 oz carton of broth…), so each ingredient shows what to buy, what's used up and what would be left over. Leftovers are weighted by how fast they spoil (fresh meat, dairy, herbs and greens most; onions and potatoes little; flour and rice not at all), and fresh things already in your pantry are used first. When something would be left over, it suggests your other recipes that use it. Then *Put on Meal Plan* (next free days) or *Add to Grocery List*. Recipe pages list the recipes that pair best with them (`js/lowwaste.js`, `js/together-ui.js`).
- **Meal Plan** (Plan tab): a week view (Sunday or Monday start, ‹ › to change weeks). Tap **+ Add** on a day to pick one of your recipes as Breakfast, Lunch, Dinner or Snack, or tap **Plan** on a recipe and pick a day this week or next. **⇄** moves a meal: tap it, then **Move Here** on another day. **Add Week to Grocery List** combines every planned meal into one shopping list you can review first — a recipe planned twice counts twice, and pantry amounts are used up across the week (1½ cups of flour on hand covers the first 1½ cups, not every recipe). The plan syncs across devices like everything else (`js/mealplan.js`, `js/plan-ui.js`).
- **Creator credit**: each recipe can name its creator (an @handle or chef's name). TikTok imports fill in the @handle and recipe websites fill in the author; it shows on the recipe card and page (linked to their TikTok profile) and is searchable.
- **Fix Up** (sidebar, or the banner on Recipes): one page listing recipes that need attention — ingredients without amounts (type the amount and pick a unit right there, or mark it *No amount needed*), recipes with no categories (add the suggested ones in one tap) and recipes with no ingredients or steps. Each recipe name opens the recipe, and a button opens its source (the TikTok or website) in a new tab so you can check the amounts; the recipe page’s back arrow returns to Fix Up. Cards for recipes missing amounts show a *Needs amounts* badge, and those lines are marked on the recipe page. Lines like “salt to taste” or “parsley, for garnish” don't count.
- **Transcript import**: *Paste Text* (and TikTok captions) also understand spoken, run-on recipes — “season two pounds of chicken thighs with a teaspoon of salt, then add a cup and a half of broth…” becomes `2 lb chicken thighs`, `1 tsp salt`, `1½ cups chicken broth` plus one step per instruction, with chatter like “follow for more” dropped (`js/transcript.js`). The original words are kept in Notes.
- **Source and Creator lines**: in pasted text (*Paste Text* import, or *Paste Recipe Text to Fill In* in the editor), a line like `Source: https://…` (or `Link:` / `URL:`) fills the Source field and `Creator: @handle` (or `By:` / `Author:`) fills the Creator field instead of landing in Notes, as does a line like `From @handle` or `Recipe by @handle`. Several recipes can share one source (e.g. a post with 4 dinners); only a recipe with the same name and the same source or ingredients is skipped as already saved. A TikTok source link also fills in the creator's @handle. Other links stay in Notes.
- **Mass import** (⤓ on Recipes): *From Links* (many at once), *Paste Text* (one or many recipes; split on each “Ingredients” heading or on `---` lines) and *From Files* (Paprika `.paprikarecipes` exports with photos and categories, web pages saved from a browser, and `.txt` files — several at once). Duplicates are skipped.
- **What Can I Make?** (Pantry tab, or Recipes): ranks *your* saved recipes by what's already in your pantry (ready to cook / missing 1–2 / need more) and adds just the missing items to the grocery list. *Cook Together* finds recipes that share ingredients and builds a 2–5 meal plan with one combined shopping list (`js/planner.js`). Basics like salt, pepper, oil and water can be counted as on hand.
- **Import from links**: the ⤓ button on Recipes takes one or many links (one per line) to recipe websites or TikTok videos. Websites are read from their built-in schema.org recipe data; TikTok recipes come from the video caption (via TikTok's oEmbed). Name, photo, ingredients, steps, servings and times are filled in, and the link is kept as the source. On Android, Recipe Box also appears in the Share menu. Pages are fetched through public CORS relays (`js/importer.js`), since browsers can't read other sites directly. For reliable link imports, deploy `tools/cloudflare-worker.js` as a free Cloudflare Worker and paste its address in Settings → Link Import Relay.
- **Grocery list**: grouped by aisle or by recipe. The same ingredient from different recipes (or typed in by you) is combined into one item with the amounts added up (e.g. `1 tbsp + 3 tsp` → `2 tbsp`).
- **Pantry**: what you have at home, optionally with how much.
- **Amount pickers**: amounts are entered as a number box + fraction dropdown (1/16 to ¾) + unit dropdown (tsp, tbsp, cup, oz, lb, g, ml…) for recipe ingredients, grocery items and pantry items. A **+** next to the amount adds a second measurement when a recipe needs one (e.g. ⅔ cup + ¼ tbsp); pasted text like `1 cup plus 2 tbsp flour` is understood too. Servings, prep/cook times and categories are dropdowns.
- **Unit conversion**: on a recipe, tap any measured amount to see it in cups, ounces, grams, tablespoons, teaspoons or milliliters, or use *Show amounts in* to switch them all. Conversions follow the kitchen chart 1 c = 8 oz = 229 g = 16 tbsp = 48 tsp = 240 ml (grams are a water-weight approximation).

## Look

A Y2K "console chrome" theme: brushed-periwinkle beveled panels, a carbon navigation layer with a halftone dot texture and gold menu words, circuit-board banners tinted per section, outlined box-art headings, and warm color reserved for actions (amber for tools, orange for forward/save). Arial throughout (Arimo / Archivo Black from Google Fonts where Arial isn't installed) with a pixel font for small labels.

## Health tab

Six tools under **Health** (`js/health.js` for the math, `js/health-ui.js` for the screens):

- **TDEE & Macro Calculator**: Mifflin–St Jeor BMR × activity factor, adjusted for your goal; protein by body weight, fat 25% of calories, carbs the rest. Targets never go below 1,200 (women) / 1,500 (men) calories.
- **Ingredient Swap Calculator**: 30+ budget swaps with amounts, tips and a USDA nutrition comparison; can check one of your recipes for swaps.
- **Calorie Calculator**: add foods with amounts (g, oz, cups, “1 large”, …) or load a recipe (the **Nutrition** button on a recipe opens it here); totals per serving.
- **Nutrition Lookup**: search 7,600+ foods; full nutrition label with % Daily Value for any amount.
- **Water Intake Calculator**: ½ oz per lb of body weight + 12 oz per 30 min of exercise + extra for heat.
- **Body Fat Calculator**: U.S. Navy formula, with ACE category ranges.

Nutrition data comes from the USDA National Nutrient Database for Standard Reference, Release 28 (public domain), converted by `tools/build_nutrition.py` into `data/nutrition.json` (loaded only when a nutrition tool is opened). Inputs are remembered on the device. These are general estimates, not medical advice.

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
