# Melhorias Visuais Prioritárias para o RR-Engine

## PRIORIDADE CRÍTICA (Antes do Pitch)

### 1. Paleta de Cores Corporativa Personalizada
- **Primária**: Azul petróleo (#0D4F6F) - confiança e profissionalismo
- **Secundária**: Verde esmeralda (#10B981) - crescimento e inovação
- **Neutra**: Cinza grafite (#1F2937) - sofisticação
- **Accent**: Azul turquesa (#06B6D4) - destaque e modernidade

### 2. Tipografia Profissional com Hierarquia Clara
- **Títulos**: Inter (semi-bold, 32px-24px)
- **Corpo**: Inter (regular, 16px)
- **Legendas**: Inter (medium, 14px)

### 3. Reformular Pipeline Visual dos 10 Agentes
- Ícones customizados para cada agente (cores da paleta)
- Indicadores de status com cores (verde=concluído, azul=em andamento, cinza=pendente)
- Tooltips informativos
- Animações sutis de progresso

### 4. Espaçamento Consistente (Sistema 8pt)
- Padding/margin: 8px, 16px, 24px, 32px, 48px

## PRIORIDADE ALTA (Pós-Pitch)

### 5. Cards de Projeto Visualmente Atraentes
- Sombras sutis (shadow-md)
- Bordas arredondadas (rounded-xl)
- Thumbnails de projeto
- Badges de status coloridos

### 6. Microinterações e Feedback Visual
- Efeito hover em botões
- Animações de loading
- Transições suaves (transition-all duration-200)

## Checklist de Implementação

### Crítico (Antes do Pitch)
- [ ] Atualizar index.css com nova paleta de cores
- [ ] Importar fonte Inter no index.html
- [ ] Refatorar componente AgentProgressPipeline.tsx
- [ ] Atualizar cores dos botões principais
- [ ] Ajustar espaçamentos em Home.tsx e ProjectDetails.tsx
- [ ] Adicionar 10º agente (Auditor) na seção de agentes da Home

### Importante (Pós-Pitch)
- [ ] Criar componente ProjectCard redesenhado
- [ ] Adicionar animações em Button component
- [ ] Criar logo personalizado
- [ ] Implementar badges de status
