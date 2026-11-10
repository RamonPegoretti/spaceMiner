/**
 * The privacy policy as Markdown, rendered by src/app/legal/Markdown.tsx.
 * Edit the text here. [[Placeholders]] are facts the operator still has to fill in; they show up highlighted.
 */
export const PRIVACY_POLICY = `# Privacy policy

**Last updated:** [[date of publication]]

#### 1. Who is responsible
spaceMiner is run by [[full name of the operator]], [[postal address, or remove this line if the operator decides to give email only]], email: [[contact email]].

#### 2. What this policy covers
This policy covers the spaceMiner browser game at [[domain, e.g. spaceminer-two.vercel.app]]: a free game where you claim asteroid fields, build factories and haul cargo in a galaxy shared with other players.

#### 3. Data we process and why

##### 3.1 Visiting the game (server logs)
Our host, Vercel, automatically processes technical data whenever your browser contacts the game: IP address, date and time, the page or API address requested, browser and operating system, and referrer. We need this to deliver the game and keep it secure. Legal basis: our legitimate interest in a working, secure service (Art. 6(1)(f) GDPR). Vercel keeps these logs for a short period according to its own practice and plan, [[confirm retention in Vercel settings, e.g. 1 to 3 days for runtime logs]].

##### 3.2 Your pilot account
When you create a pilot we store:
- your **pilot name**, which **other players can see** on the galaxy map next to the fields you claim. Please don't use your real name.
- your **email address**, used only to log you in and to answer requests you send us. We do not send newsletters or marketing.
- your **password**, stored only as a salted scrypt hash. We cannot read it.
- the date your account was created.

Name, email and password are required; without them we cannot create an account. Legal basis: providing the game you signed up for (Art. 6(1)(b) GDPR). We keep this data until you delete your account.

##### 3.3 Game data
While you play we store your credits, your claims (which field, ore type, start and end time) and your factory layout and production. Legal basis: providing the game (Art. 6(1)(b) GDPR). This data is deleted together with your account. Fields you claimed show your pilot name to other players while the claim is open.

##### 3.4 Test pilots
The "Test pilot" button creates a throwaway pilot with a random name and no email. Test pilots are deleted automatically after [[N]] days without activity.

#### 4. Cookies
We use one cookie, which is strictly necessary to keep you logged in. We use no analytics, advertising or tracking cookies, and no other storage on your device, so we do not ask for cookie consent.

| Name | Provider | Purpose | Category | Duration |
|---|---|---|---|---|
| sm_session | spaceMiner (own domain) | keeps you logged in to your pilot | strictly necessary | 30 days, or until you log out |

You can delete cookies in your browser settings at any time; you will then be logged out.

The game's fonts are stored on our own server, so loading the game sends no data to Google or any font service.

#### 5. Recipients and service providers
| Provider | Purpose | Where the data is | Safeguard |
|---|---|---|---|
| Vercel Inc. | hosting and running the game | servers in Frankfurt, Germany; Vercel is a US company and its network delivers files worldwide | EU-US and Swiss-US Data Privacy Framework certification; data processing agreement |
| Neon [[legal entity, e.g. Neon, Inc.]] | database for accounts and game data | AWS data centre in Frankfurt, Germany; Neon is a US company | [[Data Privacy Framework certification / Standard Contractual Clauses, per Neon's DPA]]; data processing agreement |

These providers act only on our instructions. We do not sell your data or share it with anyone else, except where the law requires it.

#### 6. Transfers abroad
Your data is stored in Germany (EU). Because Vercel and Neon are US companies, US staff or systems of these providers may access it, for example for support or security. The United States is covered for certified companies by the EU-US Data Privacy Framework and the Swiss-US Data Privacy Framework; where a provider is not certified, Standard Contractual Clauses (with the Swiss amendments) apply.

#### 7. Retention
- Account and game data: until you delete your account.
- Test pilots: [[N]] days after their last activity.
- Server logs: according to Vercel's retention, see 3.1.

#### 8. Your rights
You can ask for access to your data, correction, deletion, restriction, a copy in a machine-readable format (portability), and you can object to processing based on our legitimate interest. You can delete your account and download your data yourself in the game under Account (tap your pilot name at the top of the screen). For anything else, email [[contact email]]. We answer within 30 days and may ask you to confirm the request from the email address of your account.

You can also complain to a data protection authority: in Switzerland the Federal Data Protection and Information Commissioner (FDPIC), www.edoeb.admin.ch; in the EU the authority of the country where you live (list at edpb.europa.eu).

#### 9. Automated decisions
We do not make decisions based solely on automated processing that have legal or similarly significant effects on you.

#### 10. Security
The game is only served over HTTPS, passwords are stored as salted hashes, and the database can only be reached by our server.

#### 11. Minimum age
spaceMiner is meant for players aged [[16]] or older. If you are younger, please don't create an account. If we learn that a younger child has an account, we delete it.

#### 12. Changes
We may update this policy when the game changes (for example if we add payments). The current version is always on this page with its date.
`;
