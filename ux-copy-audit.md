# UX Copy Audit — Mind Core Fitness

**Date:** 1 March 2026
**Scope:** All public pages, Core Buddy app (React), login portal, and supporting pages

---

## Table of Contents

1. [Consistency Issues](#1-consistency-issues)
2. [CTA Button Copy](#2-cta-button-copy)
3. [Pricing Copy Discrepancies](#3-pricing-copy-discrepancies)
4. [Tone & Voice](#4-tone--voice)
5. [Navigation Copy](#5-navigation-copy)
6. [Form Labels & Placeholders](#6-form-labels--placeholders)
7. [SEO Titles & Meta Descriptions](#7-seo-titles--meta-descriptions)
8. [Core Buddy App (React) Copy](#8-core-buddy-app-react-copy)
9. [FAQ Copy](#9-faq-copy)
10. [Miscellaneous Issues](#10-miscellaneous-issues)
11. [Page-by-Page Summary](#11-page-by-page-summary)

---

## 1. Consistency Issues

### 1.1 "1-2-1" vs "1-to-1"

The site mixes two formats for one-to-one coaching:

| Page | Text Used |
|------|-----------|
| `personal-training.html` hero | "1-to-1 coaching sessions" |
| `personal-training.html` nav label | "1-2-1 In-Person Coaching" |
| `index.html` meta description | "1-2-1 personal training" |
| `faq.html` answer | "1-to-1 personal training" |
| `faq.html` contact form option | "1-2-1 Personal Training" |
| `pricing.html` section title | "1-2-1 Personal Training" |

**Recommendation:** Pick one format and use it everywhere. "1-2-1" is more common in UK fitness marketing; "1-to-1" reads more naturally. Either works — just be consistent.

### 1.2 "Programme" vs "Program"

The site correctly uses British English "programme" throughout. No issues found.

### 1.3 "Mind Core Community" vs "Mind Core community"

| Page | Text |
|------|------|
| `personal-training.html` pricing | "Access to Mind Core Community" |
| `personal-training.html` pricing | "Mind Core Community Access" |
| `pricing.html` pricing | "Mind Core Community Access" |

**Recommendation:** Standardise capitalisation. If it's a branded feature, always capitalise as "Mind Core Community".

### 1.4 "Circuit Group Access" vs "Circuit Club"

- `pricing.html` and `personal-training.html` feature lists use "Circuit Group Access"
- The logo image is `Circuit Club.png` / `Circuit Club.webp`

**Recommendation:** Clarify if the offering is called "Circuit Group" or "Circuit Club" and use one name consistently.

---

## 2. CTA Button Copy

### 2.1 Inconsistent Primary CTAs

The main CTA buttons use different labels across the site, which can create confusion about what happens when you click:

| Page | Location | Button Text |
|------|----------|-------------|
| `index.html` | Hero | "Explore Your Options" |
| `index.html` | Nav CTA | "Get Started" |
| `personal-training.html` | Hero | "Start In-Person Coaching" |
| `personal-training.html` | Nav CTA | "Start Coaching" |
| `personal-training.html` | 4-Week card | "Get Started!" |
| `personal-training.html` | 12-Week card | "Let's Go!" |
| `personal-training.html` | 24-Week card | "Get Started" |
| `pricing.html` | Nav CTA | "Get Started" |
| `pricing.html` | PT 4-Week card | "Get Started" |
| `pricing.html` | PT 12-Week card | "Let's Go!" |
| `pricing.html` | PT 24-Week card | "Get Started" |
| `pricing.html` | Core Programme cards | "Get This Plan" |
| `pricing.html` | Core Programme bundle | "Start the Programme" |
| `pricing.html` | Core Buddy Free | "Start Free" |
| `pricing.html` | Core Buddy Monthly | "Start Free Trial" |
| `pricing.html` | Core Buddy Annual | "Get Annual Plan" |
| `core-buddy.html` | Hero | "Start Free →" |
| `core-buddy.html` | Nav CTA | "Start Free" |
| `core-buddy.html` | Final CTA | "Start Free →" |
| `core-buddy.html` | Pricing Free | "Start Free" |
| `core-buddy.html` | Pricing Monthly | "Start Free Trial" |
| `core-buddy.html` | Pricing Annual | "Start Free Trial" |
| `12-week-core-programme.html` | Hero | "Claim Your Spot — £129 Today Only" |
| `12-week-core-programme.html` | Nav CTA | "Join Now" |
| `faq.html` | Nav CTA | "Get In Touch" |
| `about.html` | Nav CTA | "Start Today" |

**Issues:**
- "Get Started!" (with exclamation mark) vs "Get Started" (without) — inconsistent punctuation
- "Let's Go!" on the featured 12-Week card is casual but isolated — no other card uses this tone
- The 12-week programme page uses urgency-driven copy ("Claim Your Spot — £129 Today Only") that differs sharply from the rest of the site's approachable tone

**Recommendation:** Standardise CTA copy per action type:
- **Contact/enquiry:** "Get In Touch" or "Get Started"
- **Free trial start:** "Start Free" or "Try Free"
- **Paid purchase:** "Get This Plan" or "Start the Programme"
- **Subscription trial:** "Start Free Trial"
- Drop the exclamation marks to match the calm, professional tone of the site

### 2.2 Secondary CTAs

| Page | Button Text |
|------|-------------|
| `personal-training.html` | "Learn More" |
| `core-buddy.html` | "See Features" |
| `index.html` | "Learn More →" |
| `pricing.html` | CTA band: "Get in Touch" |

These are fine and contextually appropriate.

---

## 3. Pricing Copy Discrepancies

### 3.1 12-Week Core Programme — Price Mismatch

| Location | Price Shown |
|----------|-------------|
| `pricing.html` bundle card | **£149** (with "save £28 vs separate") |
| `12-week-core-programme.html` hero | **£129** (struck-through £149, "Flash Sale") |
| `12-week-core-programme.html` structured data (JSON-LD) | **£129.00** |

**Issue:** The pricing page says £149 but the programme page says £129 with a "Flash Sale" banner. If the sale is permanent, update the pricing page. If the sale is temporary, the JSON-LD schema should still reflect the actual price (£149) with a sale price property.

### 3.2 Core Buddy Free Tier — Feature Discrepancy

| Location | Features Listed |
|----------|-----------------|
| `pricing.html` Core Buddy Free card | "2 workouts per week", "5 & 10 minute sessions only", "Basic dashboard", "No credit card required" |
| `core-buddy.html` Free card | "2 workouts per week", "5 & 10 minute workouts", "Habit & nutrition tracking" |
| `faq.html` FAQ answer | "two workouts per week and one daily habit to track" |

**Issues:**
- `pricing.html` says "Basic dashboard" but `core-buddy.html` says "Habit & nutrition tracking" — are these the same thing?
- `faq.html` mentions "one daily habit to track" as a free tier limitation, but neither pricing card mentions this limit
- `core-buddy.html` doesn't mention "No credit card required" in the card itself (it's mentioned in the hero note instead)

**Recommendation:** Align the feature lists across all three locations. Be specific about what "Basic dashboard" means.

### 3.3 Core Buddy Pricing Badge Inconsistency

| Location | Monthly Badge | Annual Badge |
|----------|--------------|--------------|
| `pricing.html` | "7-Day Free Trial" (on Featured card) | "Save 17%" |
| `core-buddy.html` | "Most Popular" | "Best Value — Save 17%" |

**Recommendation:** Decide whether Monthly is "Most Popular" or the Featured card. The pricing page features Monthly with "7-Day Free Trial" badge; the Core Buddy page features Annual with "Best Value". These send mixed signals about which plan to choose.

---

## 4. Tone & Voice

### 4.1 Overall Assessment

The site has a strong, authentic voice — conversational, direct, and motivating. Ross's personality comes through well, especially in the FAQ answers and personal training page.

### 4.2 Tone Shifts

- **FAQ page answers** are casual and personal ("The whole point of getting a personal trainer is to help you get fit", "you'll get the odd prick who might have something to say")
- **Pricing page** is professional and clean
- **12-week programme page** uses high-pressure sales copy ("Only accepting 7 new members this month", "Sale ends when the timer hits zero", "Claim Your Spot") which contrasts with the rest of the site's "no pressure" messaging

**Recommendation:** The FAQ tone is excellent and very on-brand. Consider softening the 12-week programme page's urgency tactics to match the "no pressure, just progress" philosophy used everywhere else.

### 4.3 Tagline Consistency

The brand tagline appears in different forms:

| Location | Tagline |
|----------|---------|
| Footer (all pages) | "Strength · Mindset · Support" |
| `personal-training.html` section title | "Strength. Mindset. Support." |
| `core-buddy.html` hero tagline | "FOOD · HABITS · MOVE" |
| Schema.org data | "Food. Habits. Move." |

**Assessment:** These correctly distinguish between the PT brand pillars ("Strength. Mindset. Support.") and the Core Buddy app tagline ("Food. Habits. Move."). No change needed, but ensure both are used consistently in their respective contexts.

---

## 5. Navigation Copy

### 5.1 Nav Link Variations

Different pages have different nav link sets:

| Page | Nav Links |
|------|-----------|
| `index.html` | Home, Training, Coaching, Core Buddy, Blog, About, Pricing |
| `personal-training.html` | Home, About, Approach, Pricing, Contact, Blog, About, FAQ |
| `core-buddy.html` | Home, Features, Web App, Pricing, FAQ, About, FAQ Hub |
| `faq.html` | Home, About, FAQ, Blog, Pricing, Contact |
| `pricing.html` | Home, Personal Training, Core Buddy, 12-Week Programme, Blog, About, FAQ, Pricing |
| `12-week-core-programme.html` | Home, Personal Training, Core Buddy, Blog, About, FAQ |

**Issues:**
- `personal-training.html` has "About" listed twice (once as `#about` anchor, once as `about.html` link)
- `core-buddy.html` has both "FAQ" (anchor to `#faq` section) and "FAQ Hub" (link to `faq.html`) — confusing labels
- Nav structure differs significantly page to page; users may feel lost navigating between pages

**Recommendation:** Standardise the nav across all pages. Use one consistent set of links. Keep page-specific anchors (like `#pricing`) for in-page scrolling, but don't mix them with full-page links in the same nav.

### 5.2 "← Back" Button

All pages include a "← Back" nav button that links to `/` (home). This is helpful but could be confusing on pages where the user arrived from another internal page rather than the homepage.

---

## 6. Form Labels & Placeholders

### 6.1 Contact Form Inconsistencies

| Page | Form Location | Labels |
|------|--------------|--------|
| `faq.html` | Contact section | "Your Name *", "Email Address *", "Phone Number", "I'm Interested In", "Your Message *" |
| `core-buddy.html` | Contact modal | "Name", "Email", "I'm interested in", "Message" |
| `personal-training.html` | Contact section | "Your Name *", "Email Address *", "Phone Number", "I'm Interested In", "Message *" |

**Issues:**
- Label capitalisation varies: "I'm Interested In" vs "I'm interested in"
- Some forms add asterisks to required fields, others don't
- `core-buddy.html` modal has shorter labels than other pages
- Placeholder text varies: "Your name" vs "John Smith"

**Recommendation:** Standardise all contact forms with the same labels, required indicators, and placeholder style.

### 6.2 Dropdown Options

| Page | Dropdown Options |
|------|-----------------|
| `faq.html` | "1-2-1 Personal Training", "Online Coaching", "Core Buddy", "General Enquiry" |
| `core-buddy.html` | "Personal Training", "Fitness App", "Online Coaching", "General Enquiry" |

**Issue:** Different names for the same services. "Core Buddy" vs "Fitness App" and "1-2-1 Personal Training" vs "Personal Training".

---

## 7. SEO Titles & Meta Descriptions

### 7.1 Title Format Inconsistency

| Page | Title Format |
|------|-------------|
| `index.html` | "Mind Core Fitness \| Personal Training & Online Coaching" |
| `personal-training.html` | "1-2-1 Personal Training \| Mind Core Fitness - Elgin" |
| `core-buddy.html` | "Core Buddy \| Your All-in-One Fitness App \| Mind Core Fitness" |
| `faq.html` | "FAQ \| Fitness Questions Answered Honestly \| Mind Core Fitness" |
| `pricing.html` | "Pricing \| Mind Core Fitness - All Plans & Programmes" |
| `about.html` | "About Ross Geldart \| Personal Trainer & Fitness Coach \| Mind Core Fitness" |
| `12-week-core-programme.html` | "Unbreakable: 12-Week Core Rebuild \| Mind Core Fitness" |

**Issue:** Separator style varies between `|` and `-`. Some titles have subtitles, some don't.

**Recommendation:** Standardise to one format, e.g., `[Page Title] | Mind Core Fitness`.

---

## 8. Core Buddy App (React) Copy

### 8.1 Motivational Taglines (`CoreBuddyDashboard.jsx`)

The dashboard rotates through taglines like:
- "You have 24 hours a day... **make it count**"
- "Discipline beats motivation... **every single time**"
- "Rest when you're done, **not when you're tired**"

And time-based coach messages:
- Morning: "Rise and grind, **let's get after it!**"
- Afternoon: "Oye, **crack on and make it count!**"
- Evening: "Evening session? **Let's finish strong!**"

**Assessment:** Great tone, very on-brand. "Oye" is distinctive to Ross's voice — make sure it resonates with the broader audience.

### 8.2 Badge Names (`badgeConfig.js`)

Badge names include: "First Rep", "On Fire", "Dedicated", "Unstoppable", "Century", "2 Week Streak", "Month Strong", "8 Week Warrior", "Macro Master", "Competitor", "Habit Streak".

**Assessment:** Clear, motivating names. No issues.

### 8.3 Login/Signup Copy

- Login CTA: "Log In", "Create Free Account", "Continue with Google", "Continue with Apple"
- Password reset: "Forgot password?", "Send Reset Link", "Back to Log In"
- Error: "No account found. Please sign up or contact your trainer."

**Assessment:** Standard, clear. The error message mentioning "your trainer" is a nice brand touch.

### 8.4 Challenge Config (`challengeConfig.js`)

Challenge names: "Starter Streak", "Consistency King", "30 in 30", "Minute Master", "Habit Machine", "Iron Will".

**Issue:** "Consistency King" uses gendered language. Consider "Consistency Champion" or "Consistency Legend" for inclusivity.

---

## 9. FAQ Copy

### 9.1 FAQ Page Structure

The FAQ page is well-structured with six categories:
1. Getting Started with Fitness
2. Gym Anxiety and Mindset
3. Gym Anxiety and Mindset
4. Workouts and HIIT
5. Food and Nutrition
6. Core Buddy App
7. Working with a Coach

**Assessment:** Excellent natural-language answers that showcase Ross's expertise and personality. The FAQ answers are a strong SEO and trust asset.

### 9.2 FAQ Answers — Cross-Links

Good use of internal links from FAQ answers to service pages ("Try Core Buddy", "Learn about 1-to-1 personal training", etc.). These help drive traffic to conversion pages.

---

## 10. Miscellaneous Issues

### 10.1 Cookie Banner Text

| Page | Cookie Text |
|------|------------|
| `core-buddy.html` | "We use cookies to enhance your experience. By continuing to browse, you agree to our use of cookies." |
| `faq.html` | "We use cookies to enhance your experience on our website. By continuing to browse, you agree to our use of cookies." |

**Issue:** Slightly different wording ("your experience" vs "your experience on our website"). Standardise across all pages.

### 10.2 Footer Copy

All pages share the same footer copy:
- "Professional personal training and online coaching helping you build strength, consistency and confidence."
- Tagline: "Strength · Mindset · Support"
- "© 2026 Mind Core Fitness. All rights reserved."

**Assessment:** Consistent. Well done.

### 10.3 Core Buddy Page — Extra Footer Column

The `core-buddy.html` footer has an additional "Support" column with "Report a Bug" and "Feedback" links. Other pages don't have this column.

**Recommendation:** Either add the Support column to all footers or keep it only on Core Buddy pages (since it's app-specific, the current approach may be intentional).

### 10.4 Alt Text Quality

Most images have decent alt text, but some are generic:
- "Equipment", "Weights", "Training Area" (gallery items in `personal-training.html`)
- "Core Training" (generic for the 12-week programme page)

**Recommendation:** Make alt text more descriptive for accessibility and SEO, e.g., "Mind Core Fitness private studio weight rack" instead of "Weights".

### 10.5 12-Week Programme — Urgency/Scarcity Tactics

The `12-week-core-programme.html` page uses several high-pressure techniques:
- Flash sale countdown timer
- "Only accepting 7 new members this month"
- "Sale ends when the timer hits zero"
- "Claim Your Spot — £129 Today Only"

These contrast with the brand's stated philosophy of "no pressure, just progress." If these are genuine scarcity signals, they're fine. If artificial, they risk undermining trust.

### 10.6 "Online Coaching" Page

The `online-coaching.html` page exists but was not heavily cross-linked from the main site. The nav on most pages doesn't include it directly. Ensure this page is either properly integrated or redirected to the 12-week programme page if it's been replaced.

---

## 11. Page-by-Page Summary

| Page | Key Copy Issues |
|------|----------------|
| **index.html** | Strong hero copy. Nav CTA ("Get Started") doesn't specify what you're starting. |
| **personal-training.html** | Duplicate "About" in nav. Inconsistent CTA punctuation. Strong testimonials and authentic voice. |
| **core-buddy.html** | Clean, focused copy. "FAQ Hub" nav label is confusing. Feature descriptions are excellent. |
| **pricing.html** | Clean layout. Price mismatch with 12-week programme page. Feature lists differ from service pages. |
| **12-week-core-programme.html** | Urgency copy conflicts with brand voice. Flash sale price doesn't match pricing page. |
| **faq.html** | Excellent content. Strong SEO value. Good internal linking. Minor form label inconsistencies. |
| **about.html** | Strong personal narrative. Good use of credentials and stats. |
| **blog.html** | Standard blog listing. No copy issues. |
| **thank-you.html** | Post-conversion confirmation. Standard. |
| **privacy-policy.html** | Legal boilerplate. No voice issues expected. |
| **terms.html** | Legal boilerplate. No voice issues expected. |

---

## Priority Actions

1. **Fix pricing discrepancy** between `pricing.html` (£149) and `12-week-core-programme.html` (£129) — decide on the actual price
2. **Standardise "1-2-1" vs "1-to-1"** across the entire site
3. **Align Core Buddy free tier features** across pricing page, Core Buddy page, and FAQ
4. **Remove duplicate "About" link** in `personal-training.html` nav
5. **Rename "FAQ Hub"** to just "FAQ" in `core-buddy.html` nav, or remove the duplicate anchor link
6. **Standardise contact form labels** and dropdown options across all pages
7. **Review 12-week programme urgency copy** against brand voice guidelines
8. **Standardise CTA button text** per action type across the site
9. **Standardise cookie banner text** across all pages
10. **Consider changing "Consistency King"** to a gender-neutral alternative in the challenge config
