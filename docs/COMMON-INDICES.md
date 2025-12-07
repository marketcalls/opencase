# Common Index Reference - Zerodha & AngelOne

This document provides a comprehensive mapping of index symbols between Zerodha and AngelOne brokers, along with their normalized common format used in OpenCase for benchmarking.

## Overview

OpenCase normalizes index symbols to ensure consistent benchmarking regardless of which broker is connected:
- **Zerodha**: Uses UPPERCASE with spaces (e.g., `NIFTY 50`, `NIFTY BANK`)
- **AngelOne**: Uses Title Case (e.g., `Nifty 50`, `Nifty Bank`)
- **Normalized**: No spaces, UPPERCASE (e.g., `NIFTY`, `BANKNIFTY`)

## F&O Tradeable Indices

These are the primary indices used for Futures & Options trading and portfolio benchmarking.

| Normalized Symbol | Zerodha | AngelOne | Exchange | Description |
|-------------------|---------|----------|----------|-------------|
| `NIFTY` | NIFTY 50 | Nifty 50 | NSE_INDEX | Nifty 50 - Top 50 companies |
| `BANKNIFTY` | NIFTY BANK | Nifty Bank | NSE_INDEX | Bank Nifty - Banking sector |
| `FINNIFTY` | NIFTY FIN SERVICE | Nifty Fin Service | NSE_INDEX | Financial Services Nifty |
| `MIDCPNIFTY` | NIFTY MID SELECT | NIFTY MID SELECT | NSE_INDEX | Midcap Select Nifty |
| `NIFTYNXT50` | NIFTY NEXT 50 | Nifty Next 50 | NSE_INDEX | Next 50 large caps |
| `INDIAVIX` | INDIA VIX | India VIX | NSE_INDEX | Volatility Index |
| `SENSEX` | SENSEX | SENSEX | BSE_INDEX | BSE Sensex - Top 30 |
| `BANKEX` | BANKEX | BANKEX | BSE_INDEX | BSE Bank Index |
| `SENSEX50` | SNSX50 | SNSX50 | BSE_INDEX | BSE Sensex 50 |

## NSE Broad Market Indices

| Normalized Symbol | Zerodha | AngelOne | Description |
|-------------------|---------|----------|-------------|
| `NIFTY100` | NIFTY 100 | Nifty 100 | Top 100 companies |
| `NIFTY200` | NIFTY 200 | Nifty 200 | Top 200 companies |
| `NIFTY500` | NIFTY 500 | Nifty 500 | Top 500 companies |
| `NIFTYMIDCAP50` | NIFTY MIDCAP 50 | NIFTY MIDCAP 50 | Midcap 50 |
| `NIFTYMIDCAP100` | NIFTY MIDCAP 100 | NIFTY MIDCAP 100 | Midcap 100 |
| `NIFTYMIDCAP150` | NIFTY MIDCAP 150 | NIFTY MIDCAP 150 | Midcap 150 |
| `NIFTYSMLCAP50` | NIFTY SMLCAP 50 | NIFTY SMLCAP 50 | Smallcap 50 |
| `NIFTYSMLCAP100` | NIFTY SMLCAP 100 | NIFTY SMLCAP 100 | Smallcap 100 |
| `NIFTYSMLCAP250` | NIFTY SMLCAP 250 | NIFTY SMLCAP 250 | Smallcap 250 |
| `NIFTYLARGEMID250` | NIFTY LARGEMID250 | NIFTY LARGEMID250 | Large & Midcap 250 |
| `NIFTYMIDSML400` | NIFTY MIDSML 400 | NIFTY MIDSML 400 | Mid & Smallcap 400 |
| `NIFTYMICROCAP250` | NIFTY MICROCAP250 | - | Microcap 250 |

## NSE Sectoral Indices

| Normalized Symbol | Zerodha | AngelOne | Sector |
|-------------------|---------|----------|--------|
| `NIFTYIT` | NIFTY IT | Nifty IT | Information Technology |
| `NIFTYAUTO` | NIFTY AUTO | Nifty Auto | Automobile |
| `NIFTYPHARMA` | NIFTY PHARMA | Nifty Pharma | Pharmaceutical |
| `NIFTYMETAL` | NIFTY METAL | Nifty Metal | Metals & Mining |
| `NIFTYREALTY` | NIFTY REALTY | Nifty Realty | Real Estate |
| `NIFTYENERGY` | NIFTY ENERGY | Nifty Energy | Energy |
| `NIFTYFMCG` | NIFTY FMCG | Nifty FMCG | Fast Moving Consumer Goods |
| `NIFTYMEDIA` | NIFTY MEDIA | Nifty Media | Media & Entertainment |
| `NIFTYINFRA` | NIFTY INFRA | Nifty Infra | Infrastructure |
| `NIFTYPSUBANK` | NIFTY PSU BANK | Nifty PSU Bank | Public Sector Banks |
| `NIFTYPVTBANK` | NIFTY PVT BANK | Nifty Pvt Bank | Private Banks |
| `NIFTYHEALTHCARE` | NIFTY HEALTHCARE | Nifty Healthcare | Healthcare |
| `NIFTYCONSUMPTION` | NIFTY CONSUMPTION | Nifty Consumption | Consumer Discretionary |
| `NIFTYCOMMODITIES` | NIFTY COMMODITIES | Nifty Commodities | Commodities |
| `NIFTYOILGAS` | NIFTY OIL AND GAS | Nifty Oil & Gas | Oil & Gas |
| `NIFTYCPSE` | NIFTY CPSE | Nifty CPSE | Central Public Sector Enterprises |
| `NIFTYPSE` | NIFTY PSE | Nifty PSE | Public Sector Enterprises |
| `NIFTYMNC` | NIFTY MNC | Nifty MNC | Multinational Companies |
| `NIFTYSERVICES` | NIFTY SERV SECTOR | Nifty Services | Services Sector |

## NSE Thematic & Strategy Indices

| Normalized Symbol | Zerodha | AngelOne | Strategy |
|-------------------|---------|----------|----------|
| `NIFTYALPHA50` | NIFTY ALPHA 50 | NIFTY Alpha 50 | High Alpha stocks |
| `NIFTYHIGHBETA50` | NIFTY HIGHBETA 50 | - | High Beta stocks |
| `NIFTYLOWVOL50` | NIFTY LOW VOL 50 | - | Low Volatility stocks |
| `NIFTYDIVOPPS50` | NIFTY DIV OPPS 50 | Nifty Div Opps 50 | Dividend Opportunities |
| `NIFTYGROWSECT15` | NIFTY GROWSECT 15 | Nifty GrowSect 15 | Growth Sectors |
| `NIFTYIPO` | NIFTY IPO | - | Recent IPOs |
| `NIFTYHOUSING` | NIFTY HOUSING | - | Housing theme |
| `NIFTYEV` | NIFTY EV | - | EV & New Age Automotive |
| `NIFTYDEFENCE` | NIFTY IND DEFENCE | - | India Defence |
| `NIFTYMFG` | NIFTY INDIA MFG | - | India Manufacturing |

## BSE Indices

| Normalized Symbol | Zerodha | AngelOne | Description |
|-------------------|---------|----------|-------------|
| `BSE100` | BSE100 | BSE100 | BSE 100 |
| `BSE200` | BSE200 | BSE200 | BSE 200 |
| `BSE500` | BSE500 | BSE500 | BSE 500 |
| `BSE1000` | BSE 1000 | - | BSE 1000 |
| `BSEIT` | BSE IT | BSE IT | BSE IT sector |
| `BSECD` | BSE CD | BSE CD | Consumer Durables |
| `BSECG` | BSE CG | BSE CG | Capital Goods |
| `BSEHC` | BSE HC | BSE HC | Healthcare |
| `BSEMIDCAP` | MIDCAP | MIDCAP | BSE Midcap |
| `BSESMLCAP` | SMLCAP | SMLCAP | BSE Smallcap |
| `BSELRGCAP` | LRGCAP | LRGCAP | BSE Largecap |
| `BSEREALTY` | REALTY | REALTY | BSE Realty |
| `BSEPOWER` | POWER | POWER | BSE Power |
| `BSEMETAL` | METALINDEX | METAL | BSE Metal |
| `BSEOILGAS` | OILGAS | OILGAS | BSE Oil & Gas |
| `BSEINFRA` | INFRA | INFRA | BSE Infrastructure |
| `BSEAUTO` | AUTO | AUTO | BSE Auto |
| `BSEFMCG` | BSEFMC | BSEFMC | BSE FMCG |
| `BSEPSU` | BSEPSU | BSEPSU | BSE PSU |
| `BSEIPO` | BSEIPO | BSEIPO | BSE IPO |
| `BSECPSE` | CPSE | CPSE | BSE CPSE |
| `BSEFINSERV` | FINANCIAL SERVICES | FINSER | BSE Financial Services |

## API Usage

### Fetch All Indices
```
GET /api/instruments/indices
```

### Fetch NSE Indices Only
```
GET /api/instruments/indices?exchange=NSE_INDEX
```

### Fetch BSE Indices Only
```
GET /api/instruments/indices?exchange=BSE_INDEX
```

### Search Indices
```
GET /api/instruments/indices?q=NIFTY
GET /api/instruments/indices?q=BANK
```

### Check Index Counts
```
GET /api/instruments/status
```

Response includes:
```json
{
  "nse_index_instruments": 192,
  "bse_index_instruments": 111
}
```

## Normalization Logic

The normalization happens during instrument download:

1. **F&O Indices**: Mapped to their contract symbols
   - `NIFTY 50` / `Nifty 50` -> `NIFTY`
   - `NIFTY BANK` / `Nifty Bank` -> `BANKNIFTY`

2. **Sectoral Indices**: Spaces removed, uppercase
   - `NIFTY IT` / `Nifty IT` -> `NIFTYIT`
   - `NIFTY PHARMA` / `Nifty Pharma` -> `NIFTYPHARMA`

3. **BSE Indices**: Prefixed with BSE where needed
   - `MIDCAP` -> `BSEMIDCAP`
   - `BSE IT` -> `BSEIT`

4. **Generic Fallback**: For unmapped indices
   - Remove spaces and special characters
   - Convert to uppercase

## Re-downloading Instruments

To apply normalization to existing data, re-download instruments:

1. Go to `/contracts` page
2. Click "Download Zerodha Instruments"
3. Click "Download AngelOne Instruments"

The normalized symbols will be applied during the download process.

## Notes

- Some indices are available only in one broker
- AngelOne has fewer index instruments compared to Zerodha
- The normalization ensures consistent symbol lookup for benchmarking
- Original broker symbols are preserved in `zerodha_trading_symbol` and `angelone_trading_symbol` columns
