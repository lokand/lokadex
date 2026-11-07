// Foursquare category labels ("Dining and Drinking > Restaurant > Kebab
// Restaurant") → our place category and cuisines. The deepest label that
// matches wins; anything unmatched under Dining and Drinking is a
// restaurant with no cuisine rather than a guess.

type Mapping = { category: string; cuisines?: string[] };

const LEAF: Record<string, Mapping> = {
  "Café": { category: "cafe", cuisines: ["coffee"] },
  "Coffee Shop": { category: "cafe", cuisines: ["coffee"] },
  "Cafe, Coffee, and Tea House": { category: "cafe", cuisines: ["coffee"] },
  "Tea Room": { category: "tea_house" },
  "Bakery": { category: "bakery", cuisines: ["bakery_pastry"] },
  "Dessert Shop": { category: "dessert_shop", cuisines: ["baklava_desserts"] },
  "Ice Cream Parlor": { category: "ice_cream" },
  "Breakfast Spot": { category: "breakfast", cuisines: ["turkish_breakfast"] },
  "Bar": { category: "bar" },
  "Pub": { category: "pub" },
  "Wine Bar": { category: "wine_bar" },
  "Beer Bar": { category: "bar" },
  "Cocktail Bar": { category: "bar" },
  "Lounge": { category: "bar" },
  "Brewery": { category: "brewery" },
  "Food Truck": { category: "food_truck" },
  "Food Court": { category: "restaurant" },
  "Turkish Restaurant": { category: "restaurant", cuisines: ["turkish"] },
  "Meyhane": { category: "meyhane", cuisines: ["meze", "turkish"] },
  "Kebab Restaurant": { category: "restaurant", cuisines: ["kebab"] },
  "Doner Restaurant": { category: "restaurant", cuisines: ["doner"] },
  "Kokoreç Restaurant": { category: "street_food", cuisines: ["turkish"] },
  "Pide Restaurant": { category: "restaurant", cuisines: ["pide_lahmacun"] },
  "Köfte Restaurant": { category: "restaurant", cuisines: ["turkish"] },
  "Ottoman Restaurant": { category: "restaurant", cuisines: ["ottoman"] },
  "Home Cooking Restaurant": { category: "diner", cuisines: ["home_cooking"] },
  "Seafood Restaurant": { category: "restaurant", cuisines: ["seafood"] },
  "Steakhouse": { category: "restaurant", cuisines: ["steakhouse"] },
  "Pizzeria": { category: "pizzeria", cuisines: ["pizza"] },
  "Fast Food Restaurant": { category: "fast_food" },
  "Burger Joint": { category: "fast_food", cuisines: ["burger"] },
  "Fried Chicken Joint": { category: "fast_food", cuisines: ["chicken"] },
  "Sandwich Spot": { category: "fast_food", cuisines: ["sandwiches"] },
  "Soup Spot": { category: "restaurant", cuisines: ["soup"] },
  "Sushi Restaurant": { category: "restaurant", cuisines: ["sushi", "japanese"] },
  "Japanese Restaurant": { category: "restaurant", cuisines: ["japanese"] },
  "Ramen Restaurant": { category: "restaurant", cuisines: ["ramen", "japanese"] },
  "Chinese Restaurant": { category: "restaurant", cuisines: ["chinese"] },
  "Korean Restaurant": { category: "restaurant", cuisines: ["korean"] },
  "Thai Restaurant": { category: "restaurant", cuisines: ["thai"] },
  "Vietnamese Restaurant": { category: "restaurant", cuisines: ["vietnamese"] },
  "Asian Restaurant": { category: "restaurant", cuisines: ["asian_fusion"] },
  "Indian Restaurant": { category: "restaurant", cuisines: ["indian"] },
  "Italian Restaurant": { category: "restaurant", cuisines: ["italian"] },
  "French Restaurant": { category: "restaurant", cuisines: ["french"] },
  "Greek Restaurant": { category: "restaurant", cuisines: ["greek"] },
  "Mediterranean Restaurant": { category: "restaurant", cuisines: ["mediterranean"] },
  "Middle Eastern Restaurant": { category: "restaurant", cuisines: ["middle_eastern"] },
  "Lebanese Restaurant": { category: "restaurant", cuisines: ["lebanese"] },
  "Persian Restaurant": { category: "restaurant", cuisines: ["persian"] },
  "Mexican Restaurant": { category: "restaurant", cuisines: ["mexican"] },
  "American Restaurant": { category: "restaurant", cuisines: ["american"] },
  "Spanish Restaurant": { category: "restaurant", cuisines: ["spanish"] },
  "Georgian Restaurant": { category: "restaurant", cuisines: ["georgian"] },
  "Balkan Restaurant": { category: "restaurant", cuisines: ["balkan"] },
  "Vegan and Vegetarian Restaurant": { category: "restaurant", cuisines: ["vegan", "vegetarian"] },
  "Healthy Restaurant": { category: "restaurant", cuisines: ["healthy"] },
  "Diner": { category: "diner" },
  "Restaurant": { category: "restaurant" },
  "Hair Salon": { category: "hair_salon" },
  "Barbershop": { category: "barbershop" },
  "Nail Salon": { category: "nail_salon" },
  "Beauty Salon": { category: "beauty_salon" },
  "Spa": { category: "spa" },
  "Massage Clinic": { category: "massage" },
  "Health and Beauty Service": { category: "beauty_salon" },
};

export function mapCategories(labels: string[]): Mapping | null {
  for (const label of labels) {
    const parts = label.split(" > ");
    for (let i = parts.length - 1; i >= 0; i--) {
      const m = LEAF[parts[i]!];
      if (m) return m;
    }
    if (parts[0] === "Dining and Drinking") return { category: "restaurant" };
  }
  return null;
}
