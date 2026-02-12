# Changelog

## [0.2.0](https://github.com/vett-sh/vett/compare/v0.1.3...v0.2.0) (2026-02-12)


### Features

* slug-based API endpoints and smart resolve ([fbafd10](https://github.com/vett-sh/vett/commit/fbafd1085d556c2dbeefd078dc2bc7ce17e35b34))

## [0.1.3](https://github.com/vett-sh/vett/compare/v0.1.2...v0.1.3) (2026-02-11)


### Bug Fixes

* add setter to stdout.columns override to prevent crash on terminal resize ([976e768](https://github.com/vett-sh/vett/commit/976e768fdc6f386698b639e0a2a268898ad42e8e))

## [0.1.2](https://github.com/vett-sh/vett/compare/v0.1.1...v0.1.2) (2026-02-10)


### Bug Fixes

* align job status enum to 'completed' for CLI contract consistency ([b89389a](https://github.com/vett-sh/vett/commit/b89389a5343c3d4325dcb89896aab80df1b7b0bf))
* harden registry response validation with Zod schemas ([782ec46](https://github.com/vett-sh/vett/commit/782ec462fef1d81d16e45f6b39816aba4079dc8e))

## [0.1.1](https://github.com/vett-sh/vett/compare/v0.1.0...v0.1.1) (2026-02-09)


### Features

* add client-side telemetry with opt-out support ([186e926](https://github.com/vett-sh/vett/commit/186e926c02471c65aad58d3bce6b041c6b80b3c1))
* adopt Sigstore for manifest signing with ECDSA P-256 ([#2](https://github.com/vett-sh/vett/issues/2)) ([0c7a0a1](https://github.com/vett-sh/vett/commit/0c7a0a174808bb58105afe10fea5263e10e6a0e3))
* CLI build + packaging pipeline for npm distribution ([255ff8e](https://github.com/vett-sh/vett/commit/255ff8ebfddc8013172f0d8170f4bb07c981df05))
* **cli:** add version resolution and freshness checks for URL inputs ([edbe8d0](https://github.com/vett-sh/vett/commit/edbe8d048457959fc39b67af6d39913ba90dfb26))
* **cli:** handle registry rate limiting ([1822ce1](https://github.com/vett-sh/vett/commit/1822ce188f30edb9a367f702544dcece8af67bb1))
* **cli:** improve retry behavior and job polling UX ([6ba73f0](https://github.com/vett-sh/vett/commit/6ba73f034667fd12554a60c53f5790a171ceecb5))
* **cli:** make all commands interactive with @clack/prompts ([be512de](https://github.com/vett-sh/vett/commit/be512deeb7a359d5092b78aab1075f683a41f22c))
* domain-as-owner identity model with nullable repo ([b5b2771](https://github.com/vett-sh/vett/commit/b5b2771764c09994948cbd7079ccf7dc93088f81))
* enforce min CLI version + upgrade UX ([a25f803](https://github.com/vett-sh/vett/commit/a25f8036878a3e5d7bec8de444d9631bf7e5a001))
* enforce skill size limits ([4c657dd](https://github.com/vett-sh/vett/commit/4c657dde037ac8a426276642ce5c20a423bdc105))
* ownership verification for GitHub transfers and HTTP redirects ([51b6aa2](https://github.com/vett-sh/vett/commit/51b6aa260d6ec333370343a831fc728e8c65a536))


### Bug Fixes

* add path traversal protection for skill installation ([2198cfe](https://github.com/vett-sh/vett/commit/2198cfe2c2b05e73e25d40a768a9276272e89692))
* **cli:** block installs through symlink traversal ([13c9896](https://github.com/vett-sh/vett/commit/13c9896d5607e81bfad6834ebeed1ae8de84fb16))
* fmt run ([c2d3378](https://github.com/vett-sh/vett/commit/c2d33789195024cf61a9f1b4eb8b55c5e06ca947))
* remove --no-verify signature bypass flag ([c353219](https://github.com/vett-sh/vett/commit/c3532199ad6d4eac18863a585ee0cb6c8c03992e))
* remove skill source column and fix up clawhub scraper ([b3682be](https://github.com/vett-sh/vett/commit/b3682be07bb1173edda0b1fbc4a2ff8d98cccf34))
* **scanner:** harden ingest retries and error reporting ([712818a](https://github.com/vett-sh/vett/commit/712818a2f1b24bcf3e0f0ad748380a5190836106))
* **web,cli:** make job polling status-only ([b48647a](https://github.com/vett-sh/vett/commit/b48647aaaa1af14d658e2ede22bdf7dab3adb235))
