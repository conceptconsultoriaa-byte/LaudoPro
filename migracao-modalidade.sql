-- ========== LaudoPro — adiciona Modalidade (Tomografia/Raio-X/Ressonancia/Mamografia) ==========

alter table lp_valores drop constraint if exists lp_valores_empresa_id_tipo_key;
alter table lp_valores add column if not exists modalidade text;
alter table lp_valores drop constraint if exists lp_valores_modalidade_check;
alter table lp_valores add constraint lp_valores_modalidade_check check (modalidade in ('tomografia','raio_x','ressonancia','mamografia'));
alter table lp_valores add constraint lp_valores_empresa_modalidade_tipo_key unique (empresa_id, modalidade, tipo);

alter table lp_laudos add column if not exists modalidade text;
alter table lp_laudos drop constraint if exists lp_laudos_modalidade_check;
alter table lp_laudos add constraint lp_laudos_modalidade_check check (modalidade in ('tomografia','raio_x','ressonancia','mamografia'));
