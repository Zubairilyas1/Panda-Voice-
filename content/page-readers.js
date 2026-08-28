// Page Readers: Deep DOM context extraction for proactive narration
// Each reader scrapes semantic content (names, prices, ratings) not just interactive elements

function detectPageType() {
    const url = window.location.href;
    const path = window.location.pathname;
    const bodyText = document.body.innerText || '';
    
    // Captcha detection (Foodpanda uses DataDome/reCAPTCHA)
    if (document.querySelector('iframe[src*="recaptcha"], iframe[src*="datadome"]') || 
        bodyText.includes('confirm you are a human') ||
        bodyText.includes('Before we continue...')) {
        return 'captcha';
    }
    
    // Dish detail popup/modal (can appear on any page)
    const dishModal = document.querySelector('[data-testid="product-detail-modal"], [data-testid="item-variation-modal"], .product-detail-modal, .bds-c-modal');
    if (dishModal && dishModal.offsetParent !== null) return 'dish_detail';
    
    if (path.includes('/checkout')) return 'checkout';
    if (path.includes('/cart')) return 'cart';
    if (path.includes('/restaurant/')) return 'restaurant_menu';
    if (url.includes('query=') || path.includes('/restaurants')) return 'search_results';
    return 'homepage';
}

function readCaptchaState() {
    return {
        type: 'captcha',
        message: 'Security check required. A captcha is blocking the page.'
    };
}

function readSearchResults() {
    const results = [];
    
    // Foodpanda renders restaurant cards with various selectors
    const cards = document.querySelectorAll('[data-testid*="vendor-tile"], [data-testid*="vendor-card"], .vendor-tile, .vendor-card, [class*="vendor-list"] a[href*="/restaurant/"]');
    
    // Fallback: find all links to restaurants
    const restaurantLinks = cards.length > 0 ? cards : document.querySelectorAll('a[href*="/restaurant/"]');
    
    restaurantLinks.forEach((card, index) => {
        if (index >= 5) return; // Cap at 5 results
        
        const name = card.querySelector('[data-testid*="name"], [class*="name"], h2, h3, [class*="title"]');
        const rating = card.querySelector('[data-testid*="rating"], [class*="rating"]');
        const deliveryTime = card.querySelector('[data-testid*="delivery-time"], [class*="delivery-time"], [class*="eta"]');
        const cuisine = card.querySelector('[data-testid*="cuisine"], [class*="cuisine"]');
        
        const nameText = name ? name.innerText.trim() : card.innerText.split('\n')[0]?.trim();
        if (!nameText) return;
        
        results.push({
            name: nameText,
            rating: rating ? rating.innerText.trim() : null,
            deliveryTime: deliveryTime ? deliveryTime.innerText.trim() : null,
            cuisine: cuisine ? cuisine.innerText.trim() : null
        });
    });
    
    return { type: 'search_results', count: results.length, restaurants: results };
}

function readRestaurantMenu() {
    const items = [];
    
    // Restaurant name
    const restaurantName = document.querySelector('[data-testid*="vendor-name"], [data-testid*="restaurant-name"], .vendor-info h1, h1');
    
    // Menu items - Foodpanda lists dishes in sections
    const menuItems = document.querySelectorAll('[data-testid*="menu-product"], [data-testid*="product-card"], .dish-card, .menu-item, [class*="product-card"]');
    
    // Fallback: find elements that look like menu items (contain price indicators like "Rs")
    const fallbackItems = menuItems.length > 0 ? menuItems : document.querySelectorAll('[class*="menu"] [class*="item"], [class*="product-list"] > div');
    
    fallbackItems.forEach((item, index) => {
        if (index >= 5) return; // Cap at 5 items for narration
        
        const name = item.querySelector('[data-testid*="product-name"], [class*="name"], h3, span[class*="title"]');
        const price = item.querySelector('[data-testid*="product-price"], [data-testid*="price"], [class*="price"], [class*="amount"]');
        const desc = item.querySelector('[data-testid*="product-description"], [class*="description"]');
        
        const nameText = name ? name.innerText.trim() : null;
        if (!nameText) return;
        
        items.push({
            name: nameText,
            price: price ? price.innerText.trim() : null,
            description: desc ? desc.innerText.trim().substring(0, 50) : null
        });
    });
    
    return {
        type: 'restaurant_menu',
        restaurantName: restaurantName ? restaurantName.innerText.trim() : 'This restaurant',
        itemCount: items.length,
        items: items
    };
}

function readDishDetail() {
    const modal = document.querySelector('[data-testid="product-detail-modal"], [data-testid="item-variation-modal"], .product-detail-modal, .bds-c-modal');
    if (!modal) return { type: 'dish_detail', found: false };
    
    const name = modal.querySelector('[data-testid*="product-name"], h2, h1, [class*="title"]');
    const price = modal.querySelector('[data-testid*="product-price"], [data-testid*="price"], [class*="price"]');
    
    // Variants / sizes
    const variants = [];
    modal.querySelectorAll('[data-testid*="variation"], [data-testid*="option"], [class*="variation"], [class*="modifier"] label, [class*="option"] label').forEach((v, i) => {
        if (i >= 5) return;
        variants.push(v.innerText.trim());
    });
    
    // Add-ons / toppings
    const addons = [];
    modal.querySelectorAll('[data-testid*="topping"], [data-testid*="addon"], [class*="topping"], [class*="addon"]').forEach((a, i) => {
        if (i >= 5) return;
        addons.push(a.innerText.trim());
    });
    
    return {
        type: 'dish_detail',
        found: true,
        name: name ? name.innerText.trim() : 'This item',
        price: price ? price.innerText.trim() : null,
        variants: variants,
        addons: addons
    };
}

function readCartContents() {
    const cartItems = [];
    
    // Cart items
    document.querySelectorAll('[data-testid*="cart-product"], [data-testid*="cart-item"], [class*="cart-item"], [class*="cart-product"]').forEach((item, i) => {
        if (i >= 8) return;
        const name = item.querySelector('[data-testid*="name"], [class*="name"], span');
        const price = item.querySelector('[data-testid*="price"], [class*="price"]');
        const qty = item.querySelector('[data-testid*="quantity"], [class*="quantity"], [class*="qty"]');
        
        if (name) {
            cartItems.push({
                name: name.innerText.trim(),
                price: price ? price.innerText.trim() : null,
                quantity: qty ? qty.innerText.trim() : '1'
            });
        }
    });
    
    // Total
    const total = document.querySelector('[data-testid*="cart-total"], [data-testid*="total-amount"], [class*="cart-total"], [class*="total"] [class*="price"]');
    
    return {
        type: 'cart',
        itemCount: cartItems.length,
        items: cartItems,
        total: total ? total.innerText.trim() : null
    };
}

function readCheckoutState() {
    const address = document.querySelector('[data-testid*="delivery-address"], [data-testid*="address"], [class*="address-text"], [class*="delivery-address"]');
    const payment = document.querySelector('[data-testid*="payment-method"], [class*="payment-method"], [class*="payment-info"]');
    const total = document.querySelector('[data-testid*="total"], [class*="order-total"], [class*="grand-total"]');
    const voucher = document.querySelector('[data-testid*="voucher"], [data-testid*="promo"], [class*="voucher"], input[placeholder*="voucher"], input[placeholder*="promo"]');
    
    return {
        type: 'checkout',
        address: address ? address.innerText.trim() : null,
        paymentMethod: payment ? payment.innerText.trim() : null,
        total: total ? total.innerText.trim() : null,
        hasVoucherField: !!voucher
    };
}

function readHomepage() {
    return { type: 'homepage' };
}

function getPageContext() {
    const pageType = detectPageType();
    
    switch (pageType) {
        case 'captcha': return readCaptchaState();
        case 'search_results': return readSearchResults();
        case 'restaurant_menu': return readRestaurantMenu();
        case 'dish_detail': return readDishDetail();
        case 'cart': return readCartContents();
        case 'checkout': return readCheckoutState();
        default: return readHomepage();
    }
}
