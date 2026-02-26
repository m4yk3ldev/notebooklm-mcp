# MCP Tools Validation Index

This index tracks the validation status of all 32 MCP tools. Each tool has its own dedicated plan file in `docs/plans/` containing specific test cases and verification steps.

## 1. Authentication Tools
- [ ] `refresh_auth` ([Plan](01-auth-refresh.md))
- [ ] `save_auth_tokens` ([Plan](02-auth-save.md))

## 2. Notebook Management
- [x] `notebook_list` ([Plan](03-notebook-list.md))
- [x] `notebook_create` ([Plan](04-notebook-create.md))
- [x] `notebook_get` ([Plan](05-notebook-get.md))
- [x] `notebook_describe` ([Plan](06-notebook-describe.md))
- [x] `notebook_rename` ([Plan](07-notebook-rename.md))
- [x] `notebook_delete` ([Plan](08-notebook-delete.md))

## 3. Query & Configuration
- [x] `notebook_query` ([Plan](09-query-execute.md))
- [x] `chat_configure` ([Plan](10-query-config.md))

## 4. Deep Research
- [x] `research_start` ([Plan](11-research-start.md))
- [x] `research_status` ([Plan](12-research-status.md))
- [x] `research_import` ([Plan](13-research-import.md))

## 5. Source Ingestion
- [x] `source_describe` ([Plan](14-source-describe.md))
- [x] `source_get_content` ([Plan](15-source-content.md))
- [x] `notebook_add_url` ([Plan](16-source-add-url.md))
- [x] `notebook_add_text` ([Plan](17-source-add-text.md))
- [ ] `notebook_add_drive` ([Plan](18-source-add-drive.md))
- [x] `source_list_drive` ([Plan](19-source-list-drive.md))
- [ ] `source_sync_drive` ([Plan](20-source-sync-drive.md))
- [x] `source_delete` ([Plan](21-source-delete.md))

## 6. Notebook Guide & Studio
- [x] `audio_overview_create` ([Plan](22-studio-audio.md))
- [x] `video_overview_create` ([Plan](23-studio-video.md))
- [x] `infographic_create` ([Plan](24-studio-infographic.md))
- [x] `slide_deck_create` ([Plan](25-studio-slides.md))
- [x] `report_create` ([Plan](26-studio-report.md))
- [x] `flashcards_create` ([Plan](27-studio-flashcards.md))
- [x] `quiz_create` ([Plan](28-studio-quiz.md))
- [x] `data_table_create` ([Plan](29-studio-table.md))
- [x] `mind_map_create` ([Plan](30-studio-mindmap.md))
- [x] `studio_status` ([Plan](31-studio-status.md))
- [x] `studio_delete` ([Plan](32-studio-delete.md))
