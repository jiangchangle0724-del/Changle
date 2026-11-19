// A vault made once, on 2026-11-19, in format version 1, and kept here for good. It pins what is
// stored: the wrappers' fields and how their keys are derived, the passphrase normalization, the
// recovery code and the sealed blob. If a change to the vault's code makes any of this stop opening,
// real vaults made before the change would stop opening too, so the test that reads this file must
// never be "fixed" by regenerating it. A format change needs a new version number and code that
// still reads version 1.
//
// One thing in it was made a second time, the same day and before this code was first merged: the
// passphrase wrapper. After the third review of the code, the normalization was changed to fold a
// run of hyphens and dashes into one hyphen, and this vault's passphrase has two hyphens in it.
// The new wrapper was made from the vault's own recovery code, so the vault, its key, the recovery
// and passkey wrappers and the blob are byte for byte as first made. Since the merge, nothing here
// has been made again, and nothing may be.
//
// The vault key here was made for this file and never guarded anything. The passphrase is in
// vault.test.ts, typed the way different keyboards and apps would type it.
export const GOLDEN = {
  "vault": "7n5P3ttw8TpCciViT9ddfQ",
  "wrappers": [
    {
      "v": 1,
      "id": "c0Ve8uOePh0c6k376I-utg",
      "vault": "7n5P3ttw8TpCciViT9ddfQ",
      "kind": "passphrase",
      "kdf": "pbkdf2-sha256",
      "iterations": 600000,
      "salt": "9p0v_tE52PNdhoZRJiOTSpYPWrumUvbf_vTX3YhJ_YA",
      "wrapped": "U_Mn4F7dq80XcJ_uZruYiREfZgcRQc66e8_dH3RSEd-Kr8LgQ1C4mw",
      "created": "2026-11-19T09:36:00.000Z"
    },
    {
      "v": 1,
      "id": "d4YF0ByW60WXOnY1YHLYGQ",
      "vault": "7n5P3ttw8TpCciViT9ddfQ",
      "kind": "recovery",
      "kdf": "hkdf-sha256",
      "salt": "GmU4MAHdAj3AWaK-blG7naWjfN_XUd4OWUMD76EyZ-E",
      "wrapped": "SYMEGWMkqMu3CPF4om9pCz_OA8fCz1AqZ2PulGygojUn-zbGFvFHIw",
      "created": "2026-11-19T09:00:00.000Z"
    },
    {
      "v": 1,
      "id": "WPF0RvaFCkm1IiGCQ0krwA",
      "vault": "7n5P3ttw8TpCciViT9ddfQ",
      "kind": "passkey",
      "kdf": "hkdf-sha256",
      "salt": "zeLsTc61GFAlEHlIA1MEXvWcL7HqRX-Ee8ApGSEllYw",
      "wrapped": "LwmN9TWLoaukdVFvKzTIbNEMmLk4HXCbDa16jZpx3rRJoNYymMkHJw",
      "created": "2026-11-19T09:00:00.000Z",
      "credential": "Z29sZGVuLWNyZWRlbnRpYWw",
      "label": "golden key"
    }
  ],
  "recoveryCode": "ZS3E-Q63X-VBAF-3T8B-H8P6-KTYZ-TTBM-T2MW-D6",
  "chunk": {
    "id": "Z29sZGVuLWNodW5rLTAwMQ",
    "type": "txns"
  },
  "value": {
    "note": "golden",
    "amount": -8437,
    "text": "大统华 T&T"
  },
  "blob": "AWX1SYQQzmu7eAlv8BGfD_1nKFJTM8EiOwvoxgHF3dJdVhc5_XWe5VJVP_BRVjIg39N6QAMZKpqHTO9YD9f_KinurJij3FHO4F17TW4uizKGfDmO",
  "prf": "AwoRGB8mLTQ7QklQV15lbHN6gYiPlp2kq7K5wMfO1dw"
} as const;
