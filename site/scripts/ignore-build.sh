#!/bin/bash
# « Ignored Build Step » de Vercel (vercel.json → ignoreCommand), commun aux 2 projets.
# Code de sortie : 0 = ne pas construire, 1 = construire.
B="$VERCEL_GIT_COMMIT_REF"
# Quel projet ? Le site des amis a l'adresse astuces-de-tenshi.vercel.app ; tout autre projet = site public.
# (PUBLIC_SITE=1 suffit aussi, si Vercel transmet cette variable à cette étape.)
FRIENDS="astuces-de-tenshi.vercel.app"
IS_PUBLIC=0
[ "$PUBLIC_SITE" = "1" ] && IS_PUBLIC=1
[ -n "$VERCEL_PROJECT_PRODUCTION_URL" ] && [ "$VERCEL_PROJECT_PRODUCTION_URL" != "$FRIENDS" ] && IS_PUBLIC=1
if [ "$IS_PUBLIC" = "1" ]; then
  # Site public : seulement la branche « public » (mise à jour quand on le décide).
  [ "$B" = "public" ] || { echo "Site public : branche $B ignorée"; exit 0; }
else
  # Site des amis : jamais la branche « public ».
  [ "$B" = "public" ] && { echo "Site des amis : branche public ignorée"; exit 0; }
fi
# Règle d'avant : pas de reconstruction si rien n'a changé dans site/ (ex. seul le bot a changé).
if [ -n "$VERCEL_GIT_PREVIOUS_SHA" ] && git cat-file -e "$VERCEL_GIT_PREVIOUS_SHA" 2>/dev/null && git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- . ; then
  echo "Rien de changé dans site/"; exit 0
fi
exit 1
