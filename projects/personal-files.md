---
id: personal-files
name: Zelador
repo: vibegui/zelador
lifecycle: draft
public: true
next_review: 2026-08-09
serves: [order]
---

**Espírito:** O zelador que mantém o prédio em ordem sem alarde.
**Spirit:** The caretaker who quietly keeps the building in order.

App de desktop local e open-source que organiza seus arquivos. Você traz a sua
IA; o zelador traz a metodologia. Nada sai da sua máquina. Heurística determinística
faz o trabalho óbvio, o modelo decide o ambíguo, e você aprova antes de qualquer
coisa se mover.

A local, open-source desktop app that organizes your files. You bring your own
AI; zelador brings the methodology. Nothing leaves your machine. Deterministic
heuristics do the confident work, a model handles the judgement calls, and you
approve every action before anything moves.

## Resultado declarado

Encontro qualquer arquivo meu em um mapa só, e toda arrumação é reversível.

Lixeira, nunca `rm`. Toda ação journaled com informação de desfazer, e
`zelador undo <run-id>` põe tudo de volta.

## Declared outcome

I find any file of mine in one map, and every tidy-up is reversible.

Trash, never `rm`. Every action journalled with undo information, and
`zelador undo <run-id>` puts it back.

## Critérios de sucesso

1. Mac, iCloud e Google Drive aparecem em um mapa só, com a cópia canônica conhecível.
2. Nada executa sem revisão, e toda operação tem simulação, trilha de auditoria e caminho de volta.
3. Arquivos em forma de credencial — kits de emergência, códigos de recuperação, `.pem`, passaporte — são reconhecidos e propostos para um volume criptografado em vez de ficarem numa pasta sincronizada.

## Success criteria

1. Mac, iCloud, and Google Drive appear in one map, with the canonical copy knowable.
2. Nothing executes unreviewed, and every operation has a dry run, an audit trail, and a way back.
3. Credential-shaped files — emergency kits, recovery codes, `.pem` keys, passports — are recognised and proposed for an encrypted volume rather than left in a synced folder.
