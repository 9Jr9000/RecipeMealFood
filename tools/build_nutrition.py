"""Builds data/nutrition.json from the USDA National Nutrient Database for Standard Reference,
Release 28 (public domain). Inputs: ABBREV.txt and FOOD_DES.txt from SR28 (also shipped in the
`fda-nutrient-database` npm package, under data/).

Usage: python3 -I tools/build_nutrition.py <dir with ABBREV.txt and FOOD_DES.txt> data/nutrition.json
"""
import json
import sys
from pathlib import Path

# Food groups left out: baby foods, fast food, restaurant foods, frozen meals/entrees,
# American Indian/Alaska Native foods (mostly regional game and fish preparations).
SKIP_GROUPS = {'0300', '2100', '2200', '3500', '3600'}

GROUPS = {
    '0100': 'Dairy & Eggs', '0200': 'Spices & Herbs', '0400': 'Fats & Oils', '0500': 'Poultry',
    '0600': 'Soups & Sauces', '0700': 'Sausages & Deli Meats', '0800': 'Breakfast Cereals',
    '0900': 'Fruits', '1000': 'Pork', '1100': 'Vegetables', '1200': 'Nuts & Seeds', '1300': 'Beef',
    '1400': 'Beverages', '1500': 'Fish & Seafood', '1600': 'Beans & Legumes', '1700': 'Lamb & Game',
    '1800': 'Baked Goods', '1900': 'Sweets', '2000': 'Grains & Pasta', '2500': 'Snacks',
}

# (output name, column in ABBREV.txt). Values are per 100 g of edible portion.
FIELDS = [
    ('kcal', 3), ('protein', 4), ('fat', 5), ('carbs', 7), ('fiber', 8), ('sugar', 9),
    ('satFat', 44), ('cholesterol', 47), ('sodium', 15), ('potassium', 14), ('calcium', 10),
    ('iron', 11), ('magnesium', 12), ('phosphorus', 13), ('zinc', 16), ('selenium', 19),
    ('vitA', 33), ('vitC', 20), ('vitD', 41), ('vitE', 40), ('vitK', 43), ('thiamin', 21),
    ('riboflavin', 22), ('niacin', 23), ('vitB6', 25), ('folate', 29), ('vitB12', 31),
]


def fields(line):
    return [f.strip('~') for f in line.rstrip('\r\n').split('^')]


def num(s):
    return None if s == '' else float(s)


def main(src, out):
    src = Path(src)
    desc = {}
    for line in src.joinpath('FOOD_DES.txt').read_text(encoding='latin-1').splitlines():
        f = fields(line)
        desc[f[0]] = (f[1], f[2])  # group code, long description
    foods = []
    for line in src.joinpath('ABBREV.txt').read_text(encoding='latin-1').splitlines():
        f = fields(line)
        if len(f) != 53:
            raise SystemExit(f'unexpected row: {line[:80]}')
        group, long_desc = desc[f[0]]
        if group in SKIP_GROUPS:
            continue
        row = [int(f[0]), long_desc, GROUPS.get(group, 'Other')]
        for _, col in FIELDS:
            v = num(f[col])
            if v is not None:
                v = round(v, 3)
                v = int(v) if v.is_integer() else v  # "143" instead of "143.0"
            row.append(v)
        # Up to two household portions, e.g. (136, "1 cup") and (8.5, "1 tbsp").
        portions = []
        for w, d in ((f[48], f[49]), (f[50], f[51])):
            if w and d:
                w = round(float(w), 2)
                portions.append([int(w) if w.is_integer() else w, d])
        row.append(portions)
        foods.append(row)
    data = {
        'source': 'USDA National Nutrient Database for Standard Reference, Release 28 (2015). Public domain.',
        'per': '100 g',
        'fields': [name for name, _ in FIELDS],
        'units': {'kcal': 'kcal', 'protein': 'g', 'fat': 'g', 'carbs': 'g', 'fiber': 'g', 'sugar': 'g', 'satFat': 'g',
                  'cholesterol': 'mg', 'sodium': 'mg', 'potassium': 'mg', 'calcium': 'mg', 'iron': 'mg',
                  'magnesium': 'mg', 'phosphorus': 'mg', 'zinc': 'mg', 'selenium': 'µg', 'vitA': 'µg', 'vitC': 'mg',
                  'vitD': 'µg', 'vitE': 'mg', 'vitK': 'µg', 'thiamin': 'mg', 'riboflavin': 'mg', 'niacin': 'mg',
                  'vitB6': 'mg', 'folate': 'µg', 'vitB12': 'µg'},
        'foods': foods,
    }
    Path(out).write_text(json.dumps(data, separators=(',', ':'), ensure_ascii=False), encoding='utf-8')
    print(f'{len(foods)} foods written to {out}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
