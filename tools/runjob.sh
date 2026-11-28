#!/bin/bash
# usage: runjob.sh "description" [fichier json]  → lance le bot SANS commit sur main (workflow_dispatch)
# Lance le bot Discord SANS commit (workflow_dispatch) puis attend la fin et récupère bot-logs.
# Exemple : tools/runjob.sh "valides" /tmp/job.json   (fichier JSON de la tâche)
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
J=$(cat "${2:-discord/job.json}")
git checkout -q -- discord/job.json 2>/dev/null
gh workflow run "Bot Discord" -R dennys2505-stack/Tenshi --ref main -f job="$J" >/dev/null
sleep 12
id=$(gh run list -R dennys2505-stack/Tenshi -w "Bot Discord" -e workflow_dispatch -L 1 --json databaseId -q '.[0].databaseId')
gh run watch $id -R dennys2505-stack/Tenshi --interval 20 >/dev/null 2>&1
echo "run $id: $(gh run view $id -R dennys2505-stack/Tenshi --json conclusion -q .conclusion)"
git fetch -q origin +bot-logs:refs/remotes/origin/bot-logs 2>/dev/null
