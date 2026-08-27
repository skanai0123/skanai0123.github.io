# Materials Project T2 sample

This is a local prototype snapshot of 80,000 real Materials Project records. Each
record stores only `id`, `composition`, and `number_density_cm3`. No CIF, atomic
coordinates, API key, or precomputed T2 is stored. The page reads this same-origin
JSON once; selecting or calculating another ID does not query Materials Project.
The picker and result heading display a chemical formula derived from the saved
composition (for example, SiC or SiO₂), alongside the MP ID. Formula labels do
not identify crystal phases or mineral names; equal formulas can have different
IDs and densities. No extra naming fields or requests are needed.

The Materials Project search is the first calculator below the page title,
followed by the element/isotope calculator and the CIF/JSON file calculator.
This document order also determines keyboard and screen-reader navigation.
The material-search script URL carries the page version as its cache key.
Keep that key in sync with `data-page-version` so a refreshed page does not
reuse an older version of the element-selection controls.

The material-search periodic table supports multiple element selections. The
list shows records containing **all** selected elements, at any stoichiometry
(and possibly other elements). No selection matches all 80,000 records. Clicking an
element again removes it; **Clear elements** resets the element filter while
preserving the text search. Unselected elements are disabled when adding them
would leave no matching saved materials under the current element and text
filters. Availability and the hover/screen-reader counts use all matching
records, not just the current page. Selected elements remain enabled for
deselection, even when a text search returns no results; removing a selection
or changing the search restores available options. Elements absent from the
snapshot remain disabled. No matches means only "not in this sample under these
filters," not that the combination cannot exist.
Selecting a listed material uses its own saved composition and density, not an
equal-ratio mixture of the clicked elements. Direct ID lookup searches the full
sample and clears incompatible filters. This filter is independent of the
single-element/isotope calculator and does not make additional requests.

The formula/ID text search combines with the selected elements. Formula search
is case-insensitive, ignores spaces, and accepts ordinary or subscript digits
(for example, `SiO2` and `SiO₂`). It is a substring search, not a chemical-formula
parser or mineral-name search. The dropdown renders at most 100 records at once;
Previous/Next visits all matching records. Direct ID lookup opens the matching
page and clears incompatible text/element filters. Pagination never changes the
saved density or calculation. Display formulas are cached once after loading.

## Source and selection

- Source: [Materials Project OPTIMADE](https://optimade.materialsproject.org/).
- Database reference: A. Jain et al., "Commentary: The Materials Project: A
  materials genome approach to accelerating materials innovation," APL Materials
  1, 011002 (2013), [DOI: 10.1063/1.4812323](https://doi.org/10.1063/1.4812323).
  This is the database reference, not a report of measured densities or the
  source of the T2 scaling model. The page links to it from the material-search
  section and References; the existing T2-model references are retained.
- Retrieved: 2026-08-27. The exact timestamp, API version, queries, and range of
  source-entry modification dates are recorded once in the JSON's `source`.
- Seed IDs: `mp-66` (C), `mp-149` (Si), `mp-804` and `mp-830` (GaN), `mp-8062` (SiC).
- The original 100 records were selected in OPTIMADE ID order with at most two
  elements, drawn from Al, B, C, Ga, Ge, N, O, P, S, Se, Si, and Zn. These records
  are retained unchanged. The expansion added 200 ternary and 200 unary/binary
  materials in the same element scope, bringing the total to 500. This is a
  small functional sample, not a representative, stability-selected, or
  complete materials survey. The later 80,000-record expansion retains all 500
  and broadens the element scope as described below.
- Only ordered, fully occupied, three-dimensionally periodic structures with
  consistent species/site counts and positive cell volume are admitted.
- OPTIMADE is a separate snapshot and is not guaranteed to match the latest
  Materials Project website or main API. Missing IDs mean "not in this sample,"
  not "not in Materials Project."

## Expansion to 80,000 records

Continued locally on 2026-08-27, retaining all previous 70,000 records and the
verified 75,000-record stage with exactly the same three per-material fields.
That snapshot was introduced in page version 0.6.6. The element scope, maximum of three elements
per material, isotope data, scaling model and search operations are unchanged.
No API key was read or used, and nothing was published.

| Stage | Bytes | Requests used by saved stage | Actual elements |
| --- | ---: | ---: | ---: |
| 75,000 | 14,650,133 | 301 | 79 |
| 80,000 | 15,823,275 | 321 | 79 |

Both stages completed in one run, making 622 keyless requests. Candidates,
the baseline and validation report are in `test-results/t2-expansion-fvtt3p/`.
All 10,000 newly added records are ternaries. The current dataset contains 740
unary, 18,447 binary and 60,813 ternary records, covering the same 79 elements.
Each stage first reserved half the additions for ternaries, checked unary/binary
records, then filled the remaining 2,500 places from ternaries after genuine
unary/binary exhaustion. Selection remains ID-ordered, not representative,
stability-selected or screened for qubit-host suitability.

The per-group page budget increased from 240 to 280 because this snapshot needs
more than 60,000 ternaries. Each page still contains at most 250 structures;
the initial ternary query and fallback share the same cursor and finite budget.
Page-budget exhaustion never counts as source exhaustion. Structure validation,
old-record preservation, sequential requests, spacing, bounded retries and
failure behavior are unchanged.

All 49 material/model/UI tests passed at both stages. The 80,000-record candidate
passed all 77 related tests: 20 importer, two resume-safety, 49 material/model/UI
and six version-generator tests. These check all calculations, existing values,
every result page, search, error recovery, traversal beyond 240 upstream pages
and the finite 280-page importer limit. The picker still displays at most 100
materials at once (800 unfiltered pages). The record cap is 80,000 and the
snapshot payload cap is 16,000,000 characters. The upstream per-response cap
remains 8,000,000 characters.
Redistribution conditions remain unconfirmed; this is a local research snapshot.

## Earlier expansion to 70,000 records

Continued locally on 2026-08-27, retaining all previous 60,000 records and the
verified 65,000-record stage with exactly the same three per-material fields.
That snapshot used page version 0.6.5. The element scope, maximum of three elements
per material, isotope data, scaling model and search operations are unchanged.
No API key was read or used, and nothing was published.

| Stage | Bytes | Requests used by saved stage | Actual elements |
| --- | ---: | ---: | ---: |
| 65,000 | 12,371,936 | 261 | 79 |
| 70,000 | 13,500,366 | 281 | 79 |

Both stages completed in one run, making 542 keyless requests. Candidates,
the baseline and validation report are in `test-results/t2-expansion-KPaQgJ/`.
All 10,000 newly added records were ternaries. That dataset contained 740
unary, 18,447 binary and 50,813 ternary records, covering the same 79 elements.
Each stage first reserved half the additions for ternaries, checked unary/binary
records, then filled the remaining 2,500 places from ternaries after genuine
unary/binary exhaustion. Selection remains ID-ordered, not representative,
stability-selected or screened for qubit-host suitability.

The per-group page budget increased from 200 to 240 because that snapshot needed
more than 50,000 ternaries. Each page still contains at most 250 structures;
the initial ternary query and fallback share the same cursor and finite budget.
Page-budget exhaustion never counts as source exhaustion. Structure validation,
old-record preservation, sequential requests, spacing, bounded retries and
failure behavior are unchanged.

All 49 material/model/UI tests passed at both stages. The 70,000-record candidate
passed all 77 related tests: 20 importer, two resume-safety, 49 material/model/UI
and six version-generator tests. These check all calculations, existing values,
every result page, search, error recovery, traversal beyond 200 upstream pages
and the finite 240-page importer limit. The picker displayed at most 100
materials at once (700 unfiltered pages). The record cap was 70,000 and the
snapshot payload cap was 14,000,000 characters. The upstream per-response cap
was 8,000,000 characters.
Redistribution conditions remain unconfirmed; this is a local research snapshot.

## Earlier expansion to 60,000 records

Continued locally on 2026-08-27, retaining all previous 50,000 records and the
verified 55,000-record stage with exactly the same three per-material fields.
That snapshot used page version 0.6.4. The element scope, maximum of three elements
per material, isotope data, scaling model and search operations are unchanged.
No API key was read or used, and nothing was published.

| Stage | Bytes | Requests used by saved stage | Actual elements |
| --- | ---: | ---: | ---: |
| 55,000 | 10,187,720 | 221 | 79 |
| 60,000 | 11,267,851 | 241 | 79 |

Both stages completed in one run, making 462 keyless requests. Candidates, the
baseline and validation report are in `test-results/t2-expansion-PtSAfa/`.
All 10,000 newly added records were ternaries. That dataset contained 740
unary, 18,447 binary and 40,813 ternary records, covering the same 79 elements.
Each stage first reserved half the additions for ternaries, checked unary/binary
records, then filled the remaining 2,500 places from ternaries after genuine
unary/binary exhaustion. Selection remains ID-ordered, not representative,
stability-selected or screened for qubit-host suitability.

The importer allowed at most 200 pages per group and 250 structures per
page. The initial ternary query and fallback share the same cursor and page
budget. Structure validation, old-record preservation, sequential requests,
spacing, bounded retries and failure behavior are unchanged.

All 49 material/model/UI tests passed at both stages. The 60,000-record candidate
passed all 77 related tests: 20 importer, two resume-safety, 49 material/model/UI
and six version-generator tests. These check all calculations, existing values,
every result page, search, error recovery and finite importer limits. The picker
displayed at most 100 materials at once (600 unfiltered pages). The record
cap was 60,000 and the snapshot payload cap was 12,000,000 characters. The upstream
per-response cap was 8,000,000 characters.
Redistribution conditions remain unconfirmed; this is a local research snapshot.

## Earlier expansion to 50,000 records

Continued locally on 2026-08-27, retaining all previous 40,000 records and the
verified 45,000-record stage with exactly the same three per-material fields.
That snapshot used page version 0.6.3. The element scope, maximum of three elements
per material, isotope data, scaling model and search operations are unchanged.
No API key was read or used, and nothing was published.

| Stage | Bytes | Requests used by saved stage | Actual elements |
| --- | ---: | ---: | ---: |
| 45,000 | 8,079,978 | 181 | 79 |
| 50,000 | 9,125,946 | 201 | 79 |

The staged run made 382 keyless requests. Candidates, the baseline and validation
report are in `test-results/t2-expansion-UFW096/`. An initial sandboxed attempt
could not connect and produced no material candidate; it did not change active
data. The subsequent permitted run completed both stages without resuming.

All 10,000 newly added records were ternaries. That dataset contained 740
unary, 18,447 binary and 30,813 ternary records, covering the same 79 elements.
The importer first reserves half each batch for ternaries, checks unary/binary
records, then fills the rest from ternaries after unary/binary exhaustion. Each
stage filled its remaining 2,500 places that way. Selection is still ID-ordered,
not representative, stability-selected or screened for qubit-host suitability.

The per-group request-page budget increased from 100 to 200 because more than
25,000 ternaries are needed. Each page still contains at most 250 structures;
the initial ternary query and fallback share the same cursor and page budget.
Page-budget exhaustion never counts as source exhaustion. Structure validation,
sequential requests, spacing and bounded retries remain unchanged.

All 49 material/model/UI tests passed at both stages. The 50,000-record candidate
passed all 77 related tests, including 20 importer, two resume-safety and six
version-generator tests. These check calculations, old-record preservation,
every result page, and continued traversal beyond 100 pages without removing
the finite importer budget. The picker displayed at most 100 materials at
once (500 unfiltered pages). The record cap was 50,000 and the snapshot payload
cap was 10,000,000 characters. The per-response upstream cap was 8,000,000.
Redistribution conditions remain unconfirmed; this is a local research snapshot.

## Earlier expansion to 40,000 records

Continued locally on 2026-08-27, retaining all previous 30,000 records and the
verified 35,000-record stage with exactly the same three per-material fields.
That snapshot used page version 0.6.2. The element scope, maximum of three elements
per material, isotope data, scaling model and search operations are unchanged.
No API key was read or used, and nothing was published.

| Stage | Bytes | Requests used by saved stage | Actual elements |
| --- | ---: | ---: | ---: |
| 35,000 | 6,084,662 | 142 | 79 |
| 40,000 | 7,055,459 | 161 | 79 |

The first 40,000-record attempt stopped at 39,137 without producing a partial
snapshot: the unary/binary query had only 19,187 matching records. A separate
keyless count query confirmed that limit. The table excludes the unsuccessful
attempt and that diagnostic request. The corrected importer resumed from the
verified 35,000-record candidate and filled the 863-record shortfall from
ternaries, continuing its existing cursor and page budget. It did not broaden
the element scope or relax structure validation.

That dataset contained 740 unary, 18,447 binary and 20,813 ternary records,
covering the same 79 elements. Selection still starts by reserving half each
batch for ternaries, then uses unary/binary records; further ternaries fill a
shortfall only when unary/binary results are exhausted. This remains a
non-representative, ID-ordered sample without stability or host screening.
The extra fill count is recorded in `source.selection.ternary_fill_count`.

All 49 material/model/UI tests passed at both stages. The 40,000-record candidate
passed all 76 related tests, including 19 importer, two resume-safety and six
version-generator tests. Every existing record and every result page is checked.
The picker displayed at most 100 materials at once (400 unfiltered pages).
The record cap was 40,000 and the payload cap was 8,000,000 characters.
Redistribution conditions remain unconfirmed; this is a local research snapshot.

## Earlier expansion to 30,000 records

Continued locally on 2026-08-27, retaining all previous 20,000 records with
exactly the same three fields. That snapshot used page version 0.6.1: a data
update within the existing element scope, with no new model, format or search
operation. No API key was read or used, and nothing was published.

| Stage | Bytes | New structure requests | Actual elements |
| --- | ---: | ---: | ---: |
| 25,000 | 4,242,014 | 101 | 78 |
| 30,000 | 5,152,733 | 123 | 79 |

That dataset contained 524 unary, 14,526 binary and 14,950 ternary records.
All 79 permitted elements occurred, including three records containing Kr.
The permitted element scope and maximum of three elements per material are
unchanged; selection remains append-only and ID-ordered, without stability or
host-suitability screening. Every previous retrieval stage is retained.

All 49 material/model/UI tests passed independently at both stages, including
calculations for every record and traversal of every result page without missing
or duplicate IDs. The existing nuclear-spin scaling model is unchanged.
The picker displayed at most 100 materials at once (300 unfiltered pages).
The record cap was 30,000; the payload cap was 6,000,000 characters.
Redistribution conditions remain unconfirmed; this is a local research snapshot.

## Earlier expansion to 20,000 records

Continued locally on 2026-08-27 in two further stages, retaining all previous
10,000 records with exactly the same IDs, compositions and number densities.
That snapshot used page version 0.6.0, including the preceding expansion and
paginated search. No API key was read or used, and nothing was published.

| Stage | Bytes | New structure requests | Actual elements |
| --- | ---: | ---: | ---: |
| 15,000 | 2,486,299 | 62 | 78 |
| 20,000 | 3,356,973 | 82 | 78 |

That dataset contained 339 unary, 9,711 binary and 9,950 ternary records.
The permitted 79-element scope and three-element-per-material limit are
unchanged. Xe occurred in that sample; Kr was absent. The same append-only,
ID-ordered selection policy applies, without stability or host-suitability
screening. Retrieval history retains every earlier stage.

All 49 material/model/UI tests passed independently at both stages, including
calculations for every record and complete traversal of the paginated results.
The existing nuclear-spin scaling model and isotope data are unchanged.
The picker displayed at most 100 materials at once (200 unfiltered pages);
the payload limit was 6,000,000 characters and the record limit was 20,000.
Redistribution conditions remain unconfirmed; this is a local research snapshot.

## Earlier expansion to 10,000 records

Prepared and verified locally on 2026-08-27 in three stages. Nothing was
published, and no API key was read or used. Each stage retains the original 500
records with exactly the same three fields and passes the existing calculation.

| Stage | Bytes | New structure requests | Actual elements |
| --- | ---: | ---: | ---: |
| 2,000 | 322,241 | 9 | 75 |
| 5,000 | 813,851 | 22 | 76 |
| 10,000 | 1,637,623 | 41 | 77 |

That dataset contained 241 unary, 4,809 binary and 4,950 ternary records.
Selection remains append-only and ID-ordered, reserving half the new slots at
each stage for ternaries; it is not random, stability-selected or comprehensive.
The importer considers 79 elements from H through Bi for which the existing
model has usable natural-abundance spinful isotope data. Ar, Tc, Ce and Pm are
excluded, as are elements beyond Bi. Of the permitted elements, Kr and Xe do
not occur in the selected 10,000 records. Element buttons reflect actual data,
not the full permitted scope.

Only the nuclear-spin contribution is estimated. The broader dataset includes
metals and electronically magnetic materials; their total coherence time and
suitability as qubit hosts are not predicted by this model. No band-gap,
magnetism, stability, defect or temperature screening is implied.

All 49 material/model/UI tests passed independently at 2,000, 5,000 and 10,000
records, including traversal of every result page with no missing/duplicate IDs.
Redistribution conditions remain unconfirmed; this is a local research snapshot.

## Earlier expansion to 500 records

The earlier 500-record snapshot was activated locally as version 0.5.0,
following user confirmation. Its values remain unchanged in the larger dataset.

- Prepared on 2026-08-27 at 11:15:57 UTC; 78,236 bytes (about 78 KB).
- All original 100 records are preserved exactly, including number densities.
- Added 200 ternary and 200 unary/binary materials, within the same 12-element
  scope. The total is 89 unary, 211 binary, and 200 ternary records.
- The importer reserves half the new slots for ternaries, then fills the rest
  from unary/binary materials in OPTIMADE ID order. This is not a representative
  or stability-selected survey.
- Three additional keyless structure requests were needed. The candidate keeps
  the original queries and a retrieval history; it still stores only the three
  original fields per material, with no CIFs or atomic coordinates.
- All 500 records passed the existing scaling calculation and search tests.
  The previous 100-record snapshot passed the same tests before replacement.
- Redistribution terms remain unconfirmed; this is a local research candidate,
  not a published dataset or a license determination.

## Units and model

`composition` contains reduced integer atom counts (not mass fractions).
Atomic fractions are computed from these counts in the browser.
`number_density_cm3` is the total atomic number density, including spin-zero
isotopes. It is computed as

    number_density_cm3 = nsites / abs(det(lattice_vectors)) * 1e24

where OPTIMADE lattice vectors are in angstrom. The full cell's `nsites` must be
used before reducing the formula; otherwise the density is incorrect. Density
is rounded to 10 significant digits. The concentration field in the element/isotope
calculator does not override the stored density for ID calculations.

T2 uses the existing material/file calculator, unchanged:

    n_i = number_density_cm3 * atomic_fraction * natural_abundance
    T2_i (s) = 1.5e18 * abs(g_i)^(-1.65) * I_i^(-1.09) / n_i
    1 / T2_material = sum_i(1 / T2_i)

Here `g_i` is the nuclear g factor. This preserves the current file calculator's
inverse-time mixing law; the separate element/isotope mixing plots have their
own mixing model. This is a nuclear-spin-bath scaling estimate, not a CCE
calculation, measured T2, or prediction of every decoherence mechanism in an
arbitrary material. Incomplete isotope data are rejected by the ID calculator
rather than silently presented as a complete material estimate.

## Reproduction and tests

`node scripts/build-t2-materials-sample.cjs --target-count 80000` (from the
repository root) reads the currently saved snapshot, retains its records, adds
real materials up to the requested total, and prints JSON to stdout without
credentials. It never overwrites files. Review and test the candidate before
replacing the active snapshot. The current safety cap is 80,000. Shrinking
targets are rejected, and an unchanged target makes no network requests. Each
group is limited to 280 pages of at most 250 structures and uses
actual returned counts for pagination. Failures do not produce partial
snapshots. No automatic update or deployment is configured. Raw upstream
responses are not committed.

`node scripts/expand-t2-materials-stages.cjs` is the explicit maintenance job
used for the 75,000- and 80,000-record stages. It starts from the active snapshot,
skips completed stages, and generates candidates in a new
`test-results/t2-expansion-*` directory.
It never replaces the active dataset. Every stage validates all calculations
using the unchanged production functions and verifies the baseline values.
Requests are sequential with at least 500 ms between completions and the next
request. HTTP 429/502/503/504 get at most three attempts, with Retry-After honored;
a requested pause over 60 seconds stops the job instead of continuing traffic.
Candidate files and reports use exclusive creation, and failures leave the
active JSON unchanged. These checks do not establish redistribution permission.

If a run stops after completing a stage, resume from that verified candidate.
For example, before promoting the 80,000-record snapshot, the verified
75,000-record candidate can be passed explicitly:

    node scripts/expand-t2-materials-stages.cjs --resume-from test-results/t2-expansion-fvtt3p/materials-75000.json

The resume candidate must contain every active ID with exactly the same values.
After promotion, the older 75,000-record candidate is rejected because it lacks
some active records. The candidate is revalidated before requests are made and
is never overwritten. Only remaining stages are fetched into another new output
directory. When unary/binary
results are exhausted, the importer fills the shortfall from the existing
ternary cursor without changing the element scope or resetting its 280-page
budget. Hitting a page limit is not treated as exhaustion; insufficient data or
any request failure still stops without replacing the active JSON.

Run `node --test scripts/t2-materials.test.cjs` for offline validation of the
stored records, density conversion, calculation parity, and search behavior.
`node --test scripts/build-t2-materials-sample.test.cjs` checks append-only
expansion, pagination, limits, and error handling using synthetic responses.
`node --test scripts/expand-t2-materials-stages.test.cjs` checks resume arguments
and exact preservation of active records.
To check a candidate without changing the page, set `T2_MATERIALS_SNAPSHOT` to
its path and `T2_MATERIALS_EXPECTED_COUNT` to its intended count before running
the material tests. Test fixtures are never added to the material data.

## Attribution and publication

### Publication check on 2026-08-27

The current [Materials Project terms](https://materialsproject.org/about/terms)
were read in a browser before the requested GitHub push. They describe general
MP content as CC BY 4.0, with attribution, a license link and disclosure of
changes. They also ask users to contact `support@materialsproject.org` for
acknowledgement guidance before repackaging and publicly redistributing data.
GNoME data has separate CC BY-NC 4.0 terms; this three-field snapshot does not
identify dataset-specific licenses.

That push was paused pending confirmation of that prior contact and the
applicable data terms. No message was sent on the user's behalf, no account
terms were accepted, and no commit or push was made during this check. The
snapshot and page were unchanged at version 0.6.7 during that check. The earlier retrieval-time
limitations below are retained as historical context, not as a statement that
the current terms page is still unreadable.

Data source: Materials Project. See [how to cite Materials Project](https://materialsproject.org/about/cite)
and [Materials Project terms](https://materialsproject.org/about/terms).
Canonical reference: A. Jain et al., "Commentary: The Materials Project: A
materials genome approach to accelerating materials innovation," APL Materials
1, 011002 (2013),
[doi:10.1063/1.4812323](https://doi.org/10.1063/1.4812323).

At retrieval, this prototype had not been published. The OPTIMADE `/v1/info`
response did not declare a license (`license` and `available_licenses` were
null), and the current terms page could not be retrieved automatically. Do not
assume that anonymous API access grants unrestricted redistribution rights.
Confirm the current terms and any dataset-specific restrictions before publicly
redistributing this snapshot or an expanded version. No blanket license is
assigned to these third-party data by this repository.
