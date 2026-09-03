# Fee quiz and fee sheet moved to OSCE Coach

`fee-quiz.html`, `dental-fee-ranges.html` and `dental-fee-ranges.pdf` are still
in this repo — nothing has been deleted — but `vercel.json` now redirects all
three to OSCE Coach, where the fee sheet sits behind a lead-capture form.

**Why the redirect is load-bearing:** the gate on Coach is worthless while the
identical content is one click away here. Anyone who found this site could read
the sheet without ever filling the form, and search engines would keep the free
URLs indexed.

## Editing the content

These pages are still authored HERE. After editing either file, regenerate the
copies Coach serves:

    cd ../osce-examiner-local
    python3 scripts/sync-fee-content.py

then commit the regenerated `lib/fee-content/*` in that repo and redeploy it.

## Undoing this

Delete the `redirects` block from `vercel.json` and redeploy. The pages come
straight back — they never went anywhere.
