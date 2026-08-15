/**
 * Catálogo de itens fiscalizados no transporte escolar.
 *
 * Cada item gera, quando marcado como IRREGULAR, uma frase padronizada que é
 * usada automaticamente na redação do relatório final (campo "Observações"),
 * no mesmo estilo do Relatório de Fiscalização nº 01/2026.
 *
 * Os textos de base legal são editáveis: ajuste-os conforme a legislação
 * municipal aplicável e confira os incisos dos arts. 230 e 231 do CTB antes
 * de encaminhar o relatório.
 */

export const GRUPOS = [
  { id: 'condutor', titulo: 'Documentação do condutor', icone: '👤' },
  { id: 'veiculo', titulo: 'Documentação do veículo', icone: '📄' },
  { id: 'equipamentos', titulo: 'Equipamentos e identificação', icone: '🚐' },
  { id: 'conservacao', titulo: 'Conservação e segurança', icone: '🔧' },
  { id: 'operacao', titulo: 'Condições de operação', icone: '🎒' },
];

/**
 * status possíveis por item: 'conforme' | 'irregular' | 'na' | null (não verificado)
 * gravidade: referência para triagem interna da equipe.
 */
export const ITENS = [
  // ---------------------------------------------------------------- condutor
  {
    id: 'cnh_categoria',
    grupo: 'condutor',
    titulo: 'CNH categoria D (ou superior)',
    ajuda: 'Conferir a categoria impressa na CNH. Categorias C ou B não autorizam o transporte escolar.',
    frase: 'condutor não habilitado na categoria exigida (mínimo categoria D)',
    base: 'CTB, art. 138, II',
    gravidade: 'gravissima',
  },
  {
    id: 'cnh_validade',
    grupo: 'condutor',
    titulo: 'CNH dentro da validade',
    frase: 'CNH vencida',
    base: 'CTB, art. 162, V',
    gravidade: 'gravissima',
  },
  {
    id: 'cete',
    grupo: 'condutor',
    titulo: 'Curso especializado de transporte escolar (CETE)',
    ajuda: 'Certificado do curso especializado, nos termos da regulamentação do CONTRAN.',
    frase: 'condutor sem comprovação de conclusão do Curso CETE',
    base: 'CTB, art. 138, IV',
    gravidade: 'gravissima',
  },
  {
    id: 'autorizacao',
    grupo: 'condutor',
    titulo: 'Autorização para exercer a atividade de condutor escolar',
    ajuda: 'Autorização expedida pelo órgão executivo de trânsito / poder concedente.',
    frase: 'ausência de autorização para o exercício da atividade',
    base: 'CTB, arts. 136 e 137',
    gravidade: 'gravissima',
  },
  {
    id: 'autorizacao_afixada',
    grupo: 'condutor',
    titulo: 'Autorização afixada no interior do veículo, com a lotação',
    frase: 'autorização não afixada na parte interna do veículo em local visível',
    base: 'CTB, art. 137',
    gravidade: 'media',
  },
  {
    id: 'psicotecnico',
    grupo: 'condutor',
    titulo: 'Exame psicotécnico específico vigente',
    frase: 'ausência de exame psicotécnico para transporte escolar',
    base: 'CTB, art. 147 c/c regulamentação do CONTRAN',
    gravidade: 'gravissima',
  },
  {
    id: 'matricula_detran',
    grupo: 'condutor',
    titulo: 'Matrícula/cadastro do condutor no DETRAN',
    frase: 'ausência de matrícula no DETRAN',
    base: 'Regulamentação do órgão executivo estadual de trânsito',
    gravidade: 'grave',
  },
  {
    id: 'idade_21',
    grupo: 'condutor',
    titulo: 'Condutor maior de 21 anos',
    frase: 'condutor com idade inferior a 21 anos',
    base: 'CTB, art. 138, I',
    gravidade: 'gravissima',
  },
  {
    id: 'prontuario',
    grupo: 'condutor',
    titulo: 'Prontuário sem infração grave/gravíssima nos últimos 12 meses',
    ajuda: 'Também impede a atividade a reincidência em infrações médias no período.',
    frase: 'condutor com prontuário incompatível com a atividade (infrações graves/gravíssimas nos últimos 12 meses)',
    base: 'CTB, art. 138, III',
    gravidade: 'gravissima',
  },

  // ----------------------------------------------------------------- veículo
  {
    id: 'crlv',
    grupo: 'veiculo',
    titulo: 'CRLV vigente',
    frase: 'veículo sem CRLV vigente',
    base: 'CTB, art. 230, V',
    gravidade: 'gravissima',
  },
  {
    id: 'registro_passageiros',
    grupo: 'veiculo',
    titulo: 'Registro como veículo de passageiros',
    frase: 'veículo não registrado na categoria de transporte de passageiros',
    base: 'CTB, art. 136, I',
    gravidade: 'grave',
  },
  {
    id: 'inspecao_semestral',
    grupo: 'veiculo',
    titulo: 'Inspeção semestral de segurança em dia',
    ajuda: 'Vistoria semestral dos equipamentos obrigatórios e de segurança.',
    frase: 'ausência de inspeção semestral de segurança',
    base: 'CTB, art. 136, II',
    gravidade: 'grave',
  },
  {
    id: 'cadastro_municipal',
    grupo: 'veiculo',
    titulo: 'Cadastro/permissão municipal para o transporte escolar',
    ajuda: 'Exigências próprias do Município (art. 139 do CTB).',
    frase: 'ausência de cadastro/permissão municipal para o transporte escolar',
    base: 'CTB, art. 139 c/c legislação municipal',
    gravidade: 'administrativa',
  },
  {
    id: 'contrato_prefeitura',
    grupo: 'veiculo',
    titulo: 'Contrato/credenciamento com a Prefeitura (serviço terceirizado)',
    frase: 'veículo sem contrato ou credenciamento válido junto à Administração Municipal',
    base: 'Lei nº 14.133/2021 c/c legislação municipal',
    gravidade: 'administrativa',
  },
  {
    id: 'seguro',
    grupo: 'veiculo',
    titulo: 'Seguro obrigatório/contratual em vigor',
    frase: 'ausência de comprovação de seguro em vigor',
    base: 'Edital/contrato administrativo',
    gravidade: 'administrativa',
  },

  // ------------------------------------------------------------ equipamentos
  {
    id: 'faixa_escolar',
    grupo: 'equipamentos',
    titulo: 'Faixa amarela horizontal com o dístico "ESCOLAR"',
    ajuda: 'Faixa de 40 cm de largura, à meia altura, nas laterais e na traseira, com o dístico ESCOLAR em preto.',
    frase: 'ausência de faixa lateral amarela de identificação escolar',
    base: 'CTB, art. 136, III',
    gravidade: 'grave',
  },
  {
    id: 'tacografo',
    grupo: 'equipamentos',
    titulo: 'Tacógrafo instalado e em funcionamento',
    ajuda: 'Registrador instantâneo inalterável de velocidade e tempo.',
    frase: 'ausência ou ineficiência do equipamento obrigatório (tacógrafo)',
    base: 'CTB, art. 136, IV',
    gravidade: 'grave',
  },
  {
    id: 'tacografo_laudo',
    grupo: 'equipamentos',
    titulo: 'Laudo/aferição do tacógrafo vigente',
    frase: 'ausência de laudo de aferição do tacógrafo',
    base: 'Resolução CONTRAN sobre cronotacógrafo',
    gravidade: 'grave',
  },
  {
    id: 'cintos',
    grupo: 'equipamentos',
    titulo: 'Cintos de segurança para todos os passageiros',
    ajuda: 'Em número igual à lotação e em condições de uso.',
    frase: 'ausência ou ineficiência de equipamento obrigatório (cinto de segurança)',
    base: 'CTB, art. 136, VI',
    gravidade: 'grave',
  },
  {
    id: 'lanternas',
    grupo: 'equipamentos',
    titulo: 'Lanternas dianteiras (branca/âmbar) e traseiras (vermelhas)',
    frase: 'ausência das lanternas obrigatórias de identificação do transporte escolar',
    base: 'CTB, art. 136, V',
    gravidade: 'grave',
  },
  {
    id: 'iluminacao',
    grupo: 'equipamentos',
    titulo: 'Sistema de iluminação original e em funcionamento',
    ajuda: 'Verificar faróis, lanternas, luz de freio e setas; anotar alterações e lâmpadas queimadas.',
    frase: 'sistema de iluminação alterado ou em desconformidade',
    base: 'CTB, art. 230',
    gravidade: 'grave',
  },
  {
    id: 'farois_ligados',
    grupo: 'equipamentos',
    titulo: 'Faróis acesos durante a circulação',
    frase: 'circulação sem os faróis acesos',
    base: 'CTB, art. 40, I e IV',
    gravidade: 'media',
  },
  {
    id: 'placas',
    grupo: 'equipamentos',
    titulo: 'Placas de identificação legíveis e visíveis',
    frase: 'placa de identificação ilegível',
    base: 'CTB, art. 230, VI',
    gravidade: 'grave',
  },
  {
    id: 'equip_contran',
    grupo: 'equipamentos',
    titulo: 'Demais equipamentos obrigatórios conforme o CONTRAN',
    ajuda: 'Extintor (quando exigido), saída de emergência, martelo, sinalização de emergência, estepe, etc.',
    frase: 'equipamento obrigatório em desacordo com o estabelecido pelo CONTRAN',
    base: 'CTB, art. 136, VII c/c art. 230',
    gravidade: 'grave',
  },
  {
    id: 'saida_emergencia',
    grupo: 'equipamentos',
    titulo: 'Saída de emergência sinalizada e desobstruída',
    frase: 'saída de emergência obstruída ou sem sinalização',
    base: 'Regulamentação do CONTRAN',
    gravidade: 'grave',
  },

  // ------------------------------------------------------------- conservação
  {
    id: 'pneus',
    grupo: 'conservacao',
    titulo: 'Pneus em condições de uso',
    ajuda: 'Sulco mínimo de 1,6 mm, sem bolhas, cortes ou deformações; verificar o estepe.',
    frase: 'pneus em más condições de uso',
    base: 'CTB, art. 230, XVIII',
    gravidade: 'grave',
  },
  {
    id: 'parabrisa',
    grupo: 'conservacao',
    titulo: 'Para-brisa e vidros íntegros',
    frase: 'para-brisa trincado',
    base: 'CTB, art. 230, XVIII',
    gravidade: 'grave',
  },
  {
    id: 'freios',
    grupo: 'conservacao',
    titulo: 'Sistema de freios em funcionamento',
    frase: 'sistema de freios em desconformidade',
    base: 'CTB, art. 230, XVIII',
    gravidade: 'grave',
  },
  {
    id: 'portas_bancos',
    grupo: 'conservacao',
    titulo: 'Portas, bancos e estruturas internas firmes e íntegros',
    frase: 'bancos, portas ou estruturas internas em más condições',
    base: 'CTB, art. 230, XVIII',
    gravidade: 'grave',
  },
  {
    id: 'conservacao_geral',
    grupo: 'conservacao',
    titulo: 'Estado geral de conservação e limpeza',
    frase: 'veículo em mau estado de conservação, comprometendo a segurança',
    base: 'CTB, art. 230, XVIII',
    gravidade: 'grave',
  },

  // ---------------------------------------------------------------- operação
  {
    id: 'lotacao',
    grupo: 'operacao',
    titulo: 'Número de escolares dentro da lotação autorizada',
    frase: 'transporte de escolares em número superior à lotação permitida',
    base: 'CTB, art. 137, parágrafo único',
    gravidade: 'gravissima',
  },
  {
    id: 'monitor',
    grupo: 'operacao',
    titulo: 'Monitor/acompanhante a bordo (quando exigido pelo Município)',
    frase: 'ausência de monitor acompanhante, exigido pela norma municipal',
    base: 'CTB, art. 139 c/c legislação municipal',
    gravidade: 'administrativa',
  },
  {
    id: 'itinerario',
    grupo: 'operacao',
    titulo: 'Itinerário e pontos de embarque conforme o autorizado',
    frase: 'operação em itinerário diverso do autorizado',
    base: 'Contrato/permissão municipal',
    gravidade: 'administrativa',
  },
  {
    id: 'carga_carona',
    grupo: 'operacao',
    titulo: 'Ausência de transporte de carga ou de passageiros estranhos ao serviço',
    frase: 'transporte de carga ou de passageiros estranhos ao serviço escolar',
    base: 'CTB, art. 230 c/c contrato administrativo',
    gravidade: 'media',
  },
];

export const ITENS_POR_ID = Object.fromEntries(ITENS.map((i) => [i.id, i]));

export const TIPOS_VEICULO = [
  'Ônibus',
  'Micro-ônibus',
  'Van',
  'Kombi/Furgão',
  'Camioneta',
  'Embarcação escolar',
  'Outro',
];

export const MEDIDAS = [
  'Liberado',
  'Liberado com notificação',
  'Retido para regularização',
  'Removido ao depósito',
  'Serviço interrompido',
];

export const GRAVIDADE_LABEL = {
  gravissima: 'Gravíssima',
  grave: 'Grave',
  media: 'Média',
  administrativa: 'Administrativa',
};
