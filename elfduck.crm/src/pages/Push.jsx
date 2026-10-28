import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import {

  Layers,

  Paperclip,

  Save,

  Send,

  Smartphone,

  Trash2,

} from 'lucide-react';

import { currency, num } from '@/lib/mockData';
import DataTable from '@/components/shared/DataTable';
import Badge from '@/components/shared/Badge';
import Pagination from '@/components/shared/Pagination';
import MetricGrid from '@/components/shared/MetricGrid';
import { useTableSort } from '@/lib/tableSort';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { toast } from '@/components/ui/use-toast';
import {
  PUSH_PREVIEW_CLASS,
  renderPushPreviewHtml,
} from '@/lib/pushPreviewHtml';
import { cn } from '@/lib/utils';
import { CRM_API_URL, crmFetchJson } from '@/lib/crmFetch';
import { compressImageForUpload } from '@/lib/compressImage';
import {
  clearCrmSessionToken,
  setCrmSessionToken,
} from '@/lib/crmSession';
import {
  Section,
  Chip,
  Field,
} from '@/pages/push/pushFormUi';

const TPL_PAGE_SIZE = 5;
const CAMPAIGN_PAGE_SIZE = 10;
const LANGUAGE_FILTERS = [
  { key: 'pl', label: 'PL' },
  { key: 'ru', label: 'RU' },
];

const crmFetch = crmFetchJson;

function CampaignMobileRow({
  r,
  onDelete,
  deleting,
}) {
  return (
    <div className="relative rounded-xl border border-border-soft bg-[hsl(232_26%_6%)] p-3.5 pt-8">
      <button
        type="button"
        title="Удалить из истории"
        disabled={deleting || r.status === 'running' || r.status === 'queued'}
        onClick={() => onDelete?.(r)}
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded text-[16px] leading-none text-muted-2 transition-colors hover:bg-[hsl(0_72%_58%/0.12)] hover:text-[hsl(0_80%_68%)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        ×
      </button>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-foreground">
            {r.name}
          </div>

          <div className="text-[11px] text-muted-2">
            Аудитория:{' '}
            {r.audience}
            {r.promo ? ` · ${r.promo}` : ''}
          </div>
        </div>

        <Badge
          status={r.status}
        />
      </div>

      <div className="mt-3 border-t border-border-soft pt-3">
        <MetricGrid
          cols={3}
          items={[
            {
              label: 'Дата',
              value: (() => {
                const raw = r.startedAt || r.createdAt || null;
                if (!raw) return '—';
                const date = new Date(raw);
                if (!Number.isFinite(date.getTime())) return '—';
                return date.toLocaleString('ru-RU', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                });
              })(),
            },
            {
              label: 'Разослано',
              value: num(r.recipients),
            },
            {
              label: 'Получено',
              value: num(r.sent),
            },
          ]}
        />

        <div className="mt-2.5">
          <MetricGrid
            cols={3}
            items={[
              {
                label: 'Открыто',
                value: num(r.opened),
              },
              {
                label: 'Промо',
                value: num(r.promoApplications),
              },
              {
                label: 'Конверсия',
                value: `${Number(r.conversion || 0)}%`,
                className: 'text-[hsl(255_100%_72%)]',
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

export default function Push() {
  const queryClient =
    useQueryClient();

  /*
   * AUTH
   */

  const [
    authModalOpen,
    setAuthModalOpen,
  ] = useState(false);

  const [
    authPassword,
    setAuthPassword,
  ] = useState('');

  const [
  pendingAuthAction,
  setPendingAuthAction,
] = useState(null);

  /*
   * AUDIENCE
   */

  const [
    audience,
    setAudience,
  ] = useState('all');

  const [
    statuses,
    setStatuses,
  ] = useState(
    new Set()
  );

  const [
    categories,
    setCategories,
  ] = useState(
    new Set()
  );

  const [
    locations,
    setLocations,
  ] = useState(
    new Set()
  );

  const [
    minCheck,
    setMinCheck,
  ] = useState('');

  const [
    favProduct,
    setFavProduct,
  ] = useState('');

  const [
    cashbackExpiringSoon,
    setCashbackExpiringSoon,
  ] = useState(false);

  const [
    languages,
    setLanguages,
  ] = useState(
    new Set()
  );

  const [
    telegram,
    setTelegram,
  ] = useState('');

  /*
   * MESSAGE — PL + RU текст (markdown) + інлайн-кнопки мініапу
   */

  const [bodyPl, setBodyPl] = useState('');
  const [bodyRu, setBodyRu] = useState(
    '**Соскучились по вкусам?**\n\nВернись и получи −15% на ELF KING.'
  );
  const [messageLang, setMessageLang] = useState('ru');

  const body = messageLang === 'pl' ? bodyPl : bodyRu;
  const setBody = (next) => {
    const apply = (prev) =>
      typeof next === 'function' ? next(prev) : next;
    if (messageLang === 'pl') {
      setBodyPl(apply);
    } else {
      setBodyRu(apply);
    }
  };
  const hasMessageText =
    Boolean(String(bodyPl || '').trim()) ||
    Boolean(String(bodyRu || '').trim());

  const [inlineButtons, setInlineButtons] = useState([
    { text: 'Открыть магазин', kind: 'web_app', path: '/' },
  ]);

  const bodyRef = useRef(null);

  const insertMarkdown = (before, after = before) => {
    const el = bodyRef.current;
    setBody((current) => {
      const value = String(current || '');
      const start = el?.selectionStart ?? value.length;
      const end = el?.selectionEnd ?? value.length;
      const selected = value.slice(start, end) || 'текст';
      const chunk =
        before === '> '
          ? selected
              .split('\n')
              .map((line) => `> ${line}`)
              .join('\n')
          : `${before}${selected}${after}`;
      const next = value.slice(0, start) + chunk + value.slice(end);
      const cursor = start + chunk.length;
      requestAnimationFrame(() => {
        if (!el) return;
        el.focus();
        el.setSelectionRange(cursor, cursor);
      });
      return next;
    });
  };

  const campaignNameFromBody = () => {
    const firstLine = String(bodyPl || bodyRu || '')
      .split('\n')
      .map((line) => line.replace(/\*+/g, '').trim())
      .find(Boolean);
    return firstLine?.slice(0, 80) || 'Рассылка';
  };

  const [
  mediaFile,
  setMediaFile,
] = useState(null);

const [
  mediaPreviewUrl,
  setMediaPreviewUrl,
] = useState('');

const [
  photoFileId,
  setPhotoFileId,
] = useState('');

const [photoUrl, setPhotoUrl] = useState('');

const [

  templatePhotoPreviewUrl,

  setTemplatePhotoPreviewUrl,

] = useState('');

const [
  mediaUploading,
  setMediaUploading,
] = useState(false);

  const [
    activeTpl,
    setActiveTpl,
  ] = useState(null);

  /*
   * TEMPLATE MODAL
   */

  const [
    tplPage,
    setTplPage,
  ] = useState(1);

  const [
    tplModalOpen,
    setTplModalOpen,
  ] = useState(false);

  const [
    tplName,
    setTplName,
  ] = useState('');

  /*
   * CAMPAIGNS
   */

  const [
    campPage,
    setCampPage,
  ] = useState(1);

  const {
    sortKey: campSortKey,
    sortDirection: campSortDirection,
    toggleSort: toggleCampSort,
  } = useTableSort('revenue', 'desc');

  /*
   * PERIOD — розсилки не залежать від глобального PeriodControl.
   * Аудиторія й аналітика кампаній завжди по повній базі (period=all).
   */
  const periodPayload = useMemo(() => ({ period: 'all' }), []);
  const periodQuery = useMemo(() => 'period=all', []);

  /*
   * AUTH SESSION
   */

  const {
    data: sessionData,
  } = useQuery({
    queryKey: [
      'crm-auth-session',
    ],

    queryFn: () =>
      crmFetch(
        '/crm/auth/session'
      ),

    retry: false,
  });

  const isAuthenticated =
    sessionData
      ?.authenticated ===
    true;

  /*
   * LOGIN
   */

  const loginMutation =
    useMutation({
      mutationFn:
        (password) =>
          crmFetch(
            '/crm/auth/login',
            {
              method:
                'POST',

              body:
                JSON.stringify(
                  {
                    password,
                  }
                ),
            }
          ),

onSuccess: (data) => {
  if (data?.sessionToken) {
    setCrmSessionToken(data.sessionToken);
  }

  queryClient.setQueryData(
    ['crm-auth-session'],
    {
      ok: true,
      authenticated: true,
    }
  );

  setAuthPassword('');
  setAuthModalOpen(false);

  toast({
    title: 'CRM авторизована',
  });

  const action =
    pendingAuthAction;

  setPendingAuthAction(null);

  if (
    action === 'create-template'
  ) {
    setTplName(campaignNameFromBody());

    setTplModalOpen(true);
  }

  if (
    action === 'send-campaign'
  ) {
    setTimeout(() => {
      sendCampaignMutation.mutate();
    }, 0);
  }
},

      onError:
        (error) => {
          toast({
            title:
              'Не удалось войти',

            description:
              error?.message ===
              'INVALID_CRM_PASSWORD'
                ? 'Неверный пароль'
                : error
                    ?.message ||
                  'Ошибка авторизации',

            variant:
              'destructive',
          });
        },
    });

  /*
   * META
   */

  const {
    data: metaData,
  } = useQuery({
    queryKey: [
      'crm-push-meta',
    ],

    queryFn: () =>
      crmFetch(
        '/crm/push/meta'
      ),

    staleTime:
      5 *
      60 *
      1000,
  });

  const pushMeta = useMemo(
    () => ({
      audiences: metaData?.audiences || [],
      statuses: metaData?.statuses || [],
      categories: metaData?.categories || [],
      locations: metaData?.locations || [],
      products: metaData?.products || [],
    }),
    [metaData]
  );

  /*
   * TEMPLATES
   */

  const {
    data: templatesData,
  } = useQuery({
    queryKey: [
      'crm-push-templates',
    ],

    queryFn: () =>
      crmFetch(
        '/crm/push/templates'
      ),
  });

  const templates =
    templatesData
      ?.templates ||
    [];

  /*
   * CAMPAIGNS
   */

  const {
    data: campaignsData,
  } = useQuery({
    queryKey: [
      'crm-push-campaigns',
      periodQuery,
    ],

    queryFn: () =>
      crmFetch(
        `/crm/push/campaigns?${periodQuery}`
      ),
  });

  const campaigns =
    campaignsData
      ?.campaigns ||
    [];

  /*
   * AUDIENCE PAYLOAD
   */

  // «Усі чіпи вибрані» = без фільтра (інакше клієнти без покупок відсікаються).
  const selectedOrNone = (selected, allItems) => {
    const total = Array.isArray(allItems) ? allItems.length : 0;
    if (!selected?.size || (total > 0 && selected.size >= total)) {
      return [];
    }
    return Array.from(selected);
  };

  const audiencePayload =
    useMemo(
      () => ({
        audience,

        statuses: selectedOrNone(
          statuses,
          pushMeta.statuses
        ),

        categoryKeys: selectedOrNone(
          categories,
          pushMeta.categories
        ),

        locationKeys: selectedOrNone(
          locations,
          pushMeta.locations
        ),

        minCheck:
          Number(
            minCheck ||
              0
          ),

        favProduct:
          String(
            favProduct ||
              ''
          ).trim(),

        telegram:
          String(
            telegram ||
              ''
          ).trim(),

        cashbackExpiringSoon,

        languages: selectedOrNone(
          languages,
          LANGUAGE_FILTERS
        ),
      }),

      [
        audience,
        statuses,
        categories,
        locations,
        minCheck,
        favProduct,
        telegram,
        cashbackExpiringSoon,
        languages,
        pushMeta.statuses,
        pushMeta.categories,
        pushMeta.locations,
      ]
    );

  const audienceIsLeads =
    audience === 'leads';

  const [
    debouncedAudiencePayload,
    setDebouncedAudiencePayload,
  ] = useState(
    audiencePayload
  );

  useEffect(() => {
    const timer =
      setTimeout(
        () => {
          setDebouncedAudiencePayload(
            audiencePayload
          );
        },
        350
      );

    return () =>
      clearTimeout(
        timer
      );
  }, [
    audiencePayload,
  ]);

  /*
   * AUDIENCE PREVIEW
   *
   * ВАЖНО:
   * period/from/to отправляем
   * именно в body, потому что
   * backend читает req.body.
   */

  const {
    data: audiencePreview,
    isFetching: audiencePreviewLoading,
    isPlaceholderData: audiencePreviewPlaceholder,
    isError: audiencePreviewError,
    error: audiencePreviewErrorObj,
  } = useQuery({
    queryKey: [
      'crm-push-audience-preview',
      periodQuery,
      debouncedAudiencePayload,
    ],
    enabled: isAuthenticated,
    staleTime: 0,
    retry: 1,
    placeholderData: (previous) => previous,
    queryFn: ({ signal }) => {
      const timeoutMs = 45_000;
      const timeoutController = new AbortController();
      const onAbort = () => timeoutController.abort();
      const timer = setTimeout(onAbort, timeoutMs);
      if (signal) {
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
      }

      return crmFetch('/crm/push/audience-preview', {
        method: 'POST',
        signal: timeoutController.signal,
        body: JSON.stringify({
          ...periodPayload,
          ...debouncedAudiencePayload,
        }),
      }).finally(() => {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
      });
    },
  });

  const recipients = Number(audiencePreview?.total || 0);
  const audienceIdsTruncated =
    audiencePreview?.audienceIdsTruncated === true;
  const audiencePayloadSynced =
    JSON.stringify(audiencePayload) ===
    JSON.stringify(debouncedAudiencePayload);
  const audienceCountPending =
    audiencePreviewLoading ||
    audiencePreviewPlaceholder ||
    !audiencePayloadSynced;
  const audienceReady =
    Boolean(audiencePreview) &&
    !audiencePreviewError &&
    !audienceCountPending &&
    audiencePayloadSynced &&
    !audienceIdsTruncated;
  const audiencePreviewErrorLabel = (() => {
    if (!audiencePreviewError) return null;
    const msg = String(
      audiencePreviewErrorObj?.message || audiencePreviewErrorObj?.name || ''
    ).toLowerCase();
    if (msg.includes('abort') || msg.includes('timeout')) {
      return 'таймаут';
    }
    return 'помилка';
  })();
  const requestedUsernames = Number(
    audiencePreview?.requestedUsernames || 0
  );
  const matchedUsernames = Number(
    audiencePreview?.matchedUsernames || 0
  );
  const missingUsernames = Array.isArray(audiencePreview?.missingUsernames)
    ? audiencePreview.missingUsernames
    : [];
  const audienceLanguages = audiencePreview?.languages || {};
  const audienceLangPl = Number(audienceLanguages.pl || 0);
  const audienceLangRu = Number(audienceLanguages.ru || 0);
  const audienceLangUnknown = Number(audienceLanguages.unknown || 0);
  const hasAudienceLanguageStats =
    audienceLangPl > 0 ||
    audienceLangRu > 0 ||
    audienceLangUnknown > 0;

    useEffect(() => {
  return () => {
if (

  mediaPreviewUrl &&

  mediaPreviewUrl.startsWith(

    'blob:'

  )

) {

  URL.revokeObjectURL(

    mediaPreviewUrl

  );

}
  };
}, [mediaPreviewUrl]);

const selectMedia =
  async (event) => {
    const file =
      event.target
        .files?.[0];

    event.target.value =
      '';

    if (!file) {
      return;
    }

    const allowed = [
      'image/jpeg',
      'image/png',
      'image/webp',
    ];

    if (
      !allowed.includes(
        file.type
      )
    ) {
      toast({
        title:
          'Неверный формат',

        description:
          'Можно загрузить JPG, PNG или WEBP',

        variant:
          'destructive',
      });

      return;
    }

    // До стиснення дозволяємо до 25 МБ з телефону; після compress ≤ ~2.5 МБ.
    if (file.size > 25 * 1024 * 1024) {
      toast({
        title: 'Файл слишком большой',
        description: 'Максимум 25 МБ до сжатия',
        variant: 'destructive',
      });
      return;
    }

    if (!isAuthenticated) {
      setAuthModalOpen(true);
      return;
    }

    setMediaUploading(true);

    try {
      const uploadFile = await compressImageForUpload(file, {
        maxEdge: 1920,
        maxBytes: 2.5 * 1024 * 1024,
        quality: 0.85,
      });

      const formData = new FormData();
      formData.append(
        'file',
        uploadFile,
        uploadFile.name || file.name || 'push.jpg'
      );

      const data = await crmFetch('/crm/push/upload-media', {
        method: 'POST',
        body: formData,
      });

      const uploadedUrl = String(
        data?.url || data?.photoPreviewUrl || ''
      ).trim();

      if (mediaPreviewUrl && mediaPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(mediaPreviewUrl);
      }

      setMediaFile(uploadFile);
      setMediaPreviewUrl(uploadedUrl || URL.createObjectURL(uploadFile));
      setPhotoUrl(uploadedUrl);
      setPhotoFileId(String(data?.fileId || ''));
      setTemplatePhotoPreviewUrl(uploadedUrl);

      toast({
        title: 'Медиа добавлено',
        description:
          uploadFile.size < file.size
            ? `Сжато: ${(file.size / 1024 / 1024).toFixed(1)} → ${(uploadFile.size / 1024 / 1024).toFixed(1)} МБ`
            : undefined,
      });
    } catch (error) {
      if (error?.status === 401) {
        queryClient.setQueryData(['crm-auth-session'], {
          ok: true,
          authenticated: false,
        });
        setAuthModalOpen(true);
        return;
      }

      const is413 =
        error?.status === 413 ||
        /413|too large|entity too large/i.test(
          String(error?.message || '')
        );

      toast({
        title: 'Не удалось загрузить изображение',
        description: is413
          ? 'Файл слишком большой для сервера (лимит nginx). Выберите фото меньше или обновите API/nginx (client_max_body_size 20m).'
          : error?.message || 'Ошибка загрузки',
        variant: 'destructive',
      });
    } finally {
      setMediaUploading(false);
    }
  };

const removeMedia = () => {
  if (mediaPreviewUrl && mediaPreviewUrl.startsWith('blob:')) {
    URL.revokeObjectURL(mediaPreviewUrl);
  }

  setMediaFile(null);
  setMediaPreviewUrl('');
  setPhotoFileId('');
  setPhotoUrl('');
  setTemplatePhotoPreviewUrl('');
};

  /*
   * CREATE TEMPLATE
   */

  const createTemplateMutation =
    useMutation({
      mutationFn:
        () =>
          crmFetch(
            '/crm/push/templates',
            {
              method:
                'POST',

              body:
                JSON.stringify(
                  {
                    title: tplName.trim(),
                    text: body.trim(),
                    language: messageLang,
                    photoUrl: photoUrl || templatePhotoPreviewUrl || '',
                    photoFileId: photoFileId || '',
                    photoPreviewUrl: photoUrl || templatePhotoPreviewUrl || '',
                    buttons: inlineButtons
                      .filter((btn) => String(btn?.text || '').trim())
                      .map((btn) => ({
                        text: String(btn.text || '').trim(),
                        kind: btn.kind === 'url' ? 'url' : 'web_app',
                        path: String(btn.path || '/').trim() || '/',
                        url: String(btn.url || '').trim(),
                      })),
                    buttonText: '',
                    buttonUrl: '',
                  }
                ),
            }
          ),

      onSuccess:
        async () => {
          setTplModalOpen(
            false
          );

          setTplName(
            ''
          );

          await queryClient
            .invalidateQueries(
              {
                queryKey: [
                  'crm-push-templates',
                ],
              }
            );

          toast({
            title:
              'Шаблон создан',
          });
        },

      onError:
        (error) => {
if (error?.status === 401) {
  clearCrmSessionToken();
  queryClient.setQueryData(
    ['crm-auth-session'],
    {
      ok: true,
      authenticated: false,
    }
  );

  setPendingAuthAction(
    'create-template'
  );

  setAuthModalOpen(true);

  return;
}

          toast({
            title:
              'Не удалось создать шаблон',

            description:
              error?.message ===
              'TEMPLATE_ALREADY_EXISTS'
                ? 'Шаблон с таким названием уже существует'
                : error
                    ?.message ||
                  'Ошибка сохранения шаблона',

            variant:
              'destructive',
          });
        },
    });

  const deleteTemplateMutation =
  useMutation({
    mutationFn: (templateId) =>
      crmFetch(
        `/crm/push/templates/${encodeURIComponent(
          templateId
        )}`,
        {
          method: 'DELETE',
        }
      ),

    onSuccess: async (
      _,
      templateId
    ) => {
      if (
        activeTpl ===
        templateId
      ) {
        setActiveTpl(null);
      }

      await queryClient
        .invalidateQueries({
          queryKey: [
            'crm-push-templates',
          ],
        });

      toast({
        title:
          'Шаблон удалён',
      });
    },

    onError: (error) => {
      if (
        error?.status === 401
      ) {
        clearCrmSessionToken();

        queryClient.setQueryData(
          ['crm-auth-session'],
          {
            ok: true,
            authenticated:
              false,
          }
        );

        setAuthModalOpen(true);
        return;
      }

      toast({
        title:
          'Не удалось удалить шаблон',

        description:
          error?.message ||
          'Ошибка удаления',

        variant:
          'destructive',
      });
    },
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: (campaignId) =>
      crmFetch(
        `/crm/push/campaigns/${encodeURIComponent(campaignId)}`,
        { method: 'DELETE' }
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['crm-push-campaigns'],
      });
      toast({ title: 'Рассылка удалена из истории' });
    },
    onError: (error) => {
      toast({
        title:
          error?.message === 'CAMPAIGN_STILL_RUNNING'
            ? 'Рассылка ещё идёт — удалить нельзя'
            : 'Не удалось удалить рассылку',
        description: error?.message || 'DELETE_FAILED',
        variant: 'destructive',
      });
    },
  });

  const deleteCampaign = (campaign) => {
    const campaignId = String(campaign?.id || '').trim();
    if (!campaignId || deleteCampaignMutation.isPending) return;
    if (!isAuthenticated) {
      setAuthModalOpen(true);
      return;
    }
    if (
      !window.confirm(
        `Удалить «${campaign?.name || 'рассылку'}» из истории?`
      )
    ) {
      return;
    }
    deleteCampaignMutation.mutate(campaignId);
  };

  const clearCampaignsMutation = useMutation({
    mutationFn: () =>
      crmFetch(`/crm/push/campaigns?${periodQuery}`, {
        method: 'DELETE',
      }),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({
        queryKey: ['crm-push-campaigns'],
      });
      toast({
        title: 'История очищена',
        description: `Удалено записей: ${Number(data?.deletedCount || 0)}`,
      });
    },
    onError: (error) => {
      if (error?.status === 401) {
        clearCrmSessionToken();
        queryClient.setQueryData(['crm-auth-session'], {
          ok: true,
          authenticated: false,
        });
        setAuthModalOpen(true);
        return;
      }
      toast({
        title: 'Не удалось очистить историю',
        description: error?.message || 'CLEAR_FAILED',
        variant: 'destructive',
      });
    },
  });

const deleteTemplate =
  (template) => {
    const templateId =
      String(
        template?.id || ''
      ).trim();

    if (
      !templateId ||
      deleteTemplateMutation
        .isPending
    ) {
      return;
    }

    if (!isAuthenticated) {
      setAuthModalOpen(true);
      return;
    }

    const confirmed =
      window.confirm(
        `Удалить шаблон «${
          template?.title ||
          template?.name ||
          'Без названия'
        }»?`
      );

    if (!confirmed) {
      return;
    }

    deleteTemplateMutation
      .mutate(templateId);
  };

  /*
   * SEND CAMPAIGN
   */

  const sendCampaignMutation =
    useMutation({
      mutationFn:
        () => {
          if (
            JSON.stringify(audiencePayload) !==
            JSON.stringify(debouncedAudiencePayload)
          ) {
            throw new Error('AUDIENCE_PREVIEW_STALE');
          }

          return crmFetch(
            '/crm/push/send',
            {
              method:
                'POST',

              body:
                JSON.stringify(
                  {
                    ...periodPayload,

                    name: campaignNameFromBody(),

                    // Тот же payload, что и у preview — без debounce-race
                    ...debouncedAudiencePayload,

                    title: '',

                    text:
                      bodyPl.trim() ||
                      bodyRu.trim(),
                    textPl: bodyPl.trim(),
                    textRu: bodyRu.trim(),
                    defaultLanguage: 'ru',

                    promo: '',

                    photoUrl: photoUrl || '',
                    photoFileId: photoFileId || '',

                    buttons: inlineButtons
                      .filter((btn) => String(btn?.text || '').trim())
                      .map((btn) => ({
                        text: String(btn.text || '').trim(),
                        kind: btn.kind === 'url' ? 'url' : 'web_app',
                        path: String(btn.path || '/').trim() || '/',
                        url: String(btn.url || '').trim(),
                      })),

                    buttonText: '',
                    buttonUrl: '',

                    templateId:
                      activeTpl ||
                      null,
                  }
                ),
            }
          );
        },

      onSuccess:
        async (
          data
        ) => {
          setCampPage(1);
          setBodyPl('');
          setBodyRu('');
          setInlineButtons([
            { text: 'Открыть магазин', kind: 'web_app', path: '/' },
          ]);
          setActiveTpl(null);
          setPhotoFileId('');
          setPhotoUrl('');
          setTemplatePhotoPreviewUrl('');
          if (mediaPreviewUrl?.startsWith('blob:')) {
            URL.revokeObjectURL(mediaPreviewUrl);
          }
          setMediaPreviewUrl('');
          setMediaFile(null);

          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: ['crm-push-campaigns'],
            }),
            queryClient.invalidateQueries({
              queryKey: ['crm-push-templates'],
            }),
          ]);

          toast({
            title: 'Рассылка запущена',
            description: `Получателей: ${
              data?.campaign?.recipients ?? recipients
            }. Форма очищена для следующей рассылки.`,
          });
        },

      onError:
        (error) => {
          if (
            error?.status ===
            401
          ) {
            queryClient
              .setQueryData(
                [
                  'crm-auth-session',
                ],
                {
                  ok: true,
                  authenticated:
                    false,
                }
              );

            setAuthModalOpen(
              true
            );

            return;
          }

          const messages = {
            AUDIENCE_EMPTY:
              'По выбранным фильтрам нет получателей',

            AUDIENCE_TOO_LARGE:
              'Аудитория больше лимита рассылки. Сузьте фильтры.',

            AUDIENCE_PREVIEW_STALE:
              'Счётчик аудитории ещё обновляется — подождите секунду и отправьте снова',

            MESSAGE_REQUIRED:
              'Заполни текст сообщения',

            WEBAPP_URL_NOT_CONFIGURED:
              'На backend не задан WEBAPP_URL для кнопок магазина',

            INVALID_BUTTON_URL:
              'Некорректный URL у одной из кнопок',

            BUTTON_TEXT_AND_URL_REQUIRED_TOGETHER:
              'Текст и URL кнопки нужно заполнять вместе',

            CRM_BROADCAST_ENGINE_UNAVAILABLE:
              'Модуль рассылки на backend сейчас недоступен',
          };

          toast({
            title:
              'Не удалось запустить рассылку',

            description:
              messages[
                error
                  ?.message
              ] ||
              error
                ?.message ||
              'Ошибка отправки',

            variant:
              'destructive',
          });
        },
    });

  /*
   * LOGIN ACTION
   */

  const submitCrmLogin =
    () => {
      const password =
        authPassword.trim();

      if (
        !password ||
        loginMutation
          .isPending
      ) {
        return;
      }

      loginMutation
        .mutate(
          password
        );
    };

  /*
   * HELPERS
   */

  const toggle = (
    set,
    value,
    setter
  ) => {
    const next =
      new Set(set);

    if (
      next.has(value)
    ) {
      next.delete(
        value
      );
    } else {
      next.add(
        value
      );
    }

    setter(next);
  };

  const applyTemplate =
    (template) => {
      setActiveTpl(
        template.id
      );

      const tplText =
        template.text ||
        template.preview ||
        '';
      const tplLang =
        String(template?.language || '')
          .trim()
          .toLowerCase() === 'pl'
          ? 'pl'
          : 'ru';
      setMessageLang(tplLang);
      if (tplLang === 'pl') {
        setBodyPl(tplText);
      } else {
        setBodyRu(tplText);
      }

      const suggestedAudience = String(
        template?.suggestedAudience || ''
      ).trim();
      if (suggestedAudience) {
        setAudience(suggestedAudience);
      }

      if (Array.isArray(template.buttons) && template.buttons.length) {
        setInlineButtons(
          template.buttons.map((btn) => ({
            text: String(btn?.text || ''),
            kind: btn?.kind === 'url' ? 'url' : 'web_app',
            path: String(btn?.path || '/'),
            url: String(btn?.url || ''),
          }))
        );
      } else if (template.buttonText) {
        const legacyUrl = String(template.buttonUrl || '').trim();
        const isExternal =
          /^https?:\/\//i.test(legacyUrl) || /^tg:/i.test(legacyUrl);
        setInlineButtons([
          {
            text: String(template.buttonText || ''),
            kind: isExternal ? 'url' : 'web_app',
            path: isExternal ? '/' : legacyUrl || '/',
            url: isExternal ? legacyUrl : '',
          },
        ]);
      }

      const tplUrl = String(
        template.photoUrl || template.photoPreviewUrl || ''
      ).trim();

      setPhotoFileId(template.photoFileId || '');
      setPhotoUrl(tplUrl);
      setTemplatePhotoPreviewUrl(tplUrl);
      setMediaFile(null);

      if (mediaPreviewUrl && mediaPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(mediaPreviewUrl);
      }

      setMediaPreviewUrl(tplUrl);

      toast({
        title: 'Шаблон применён',
        description:
          template.name ||
          template.title ||
          'Текст и кнопки подставлены в форму рассылки',
      });
    };

  /*
   * Внешняя кнопка создания шаблона.
   *
   * Здесь НЕЛЬЗЯ проверять tplName,
   * потому что tplName вводится
   * уже внутри модального окна.
   */

const openCreateTpl = () => {
  if (!isAuthenticated) {
    setPendingAuthAction(
      'create-template'
    );

    setAuthModalOpen(true);

    return;
  }

  setTplName(campaignNameFromBody());

  setTplModalOpen(true);
};

const confirmCreateTpl = () => {
  if (!isAuthenticated) {
    setPendingAuthAction(
      'create-template'
    );

    setTplModalOpen(false);

    setAuthModalOpen(true);

    return;
  }

  if (
    !tplName.trim() ||
    !body.trim() ||
    createTemplateMutation.isPending
  ) {
    return;
  }

  createTemplateMutation.mutate();
};

  const sendCampaign =
    () => {
      if (
        !isAuthenticated
      ) {
        setAuthModalOpen(
          true
        );

        return;
      }

      if (
        recipients <= 0 ||
        !audienceReady ||
        audienceIdsTruncated ||
        !audiencePayloadSynced ||
        !hasMessageText ||
        sendCampaignMutation.isPending
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          `Отправить рассылку ${num(
            recipients
          )} получателям?`
        );

      if (
        !confirmed
      ) {
        return;
      }

      sendCampaignMutation
        .mutate();
    };

  /*
   * PAGINATION
   */

  useEffect(() => {
    setCampPage(1);
  }, [campSortKey, campSortDirection]);

  const sortedCampaigns = useMemo(() => {
    const rows = Array.isArray(campaigns) ? [...campaigns] : [];
    if (!campSortKey) return rows;

    const direction = campSortDirection === 'asc' ? 1 : -1;
    const getValue = (row) => {
      if (campSortKey === 'sentAt') {
        const raw = row?.startedAt || row?.createdAt || null;
        if (!raw) return null;
        const ts = new Date(raw).getTime();
        return Number.isFinite(ts) ? ts : null;
      }
      const value = row?.[campSortKey];
      if (value == null || value === '') return null;
      if (typeof value === 'number') return value;
      const asNumber = Number(value);
      if (Number.isFinite(asNumber) && String(value).trim() !== '') {
        return asNumber;
      }
      return String(value).toLocaleLowerCase('ru');
    };

    return rows.sort((a, b) => {
      const left = getValue(a);
      const right = getValue(b);
      if (left == null && right == null) return 0;
      if (left == null) return 1;
      if (right == null) return -1;
      if (typeof left === 'number' && typeof right === 'number') {
        return (left - right) * direction;
      }
      return (
        String(left).localeCompare(String(right), 'ru', {
          numeric: true,
          sensitivity: 'base',
        }) * direction
      );
    });
  }, [campaigns, campSortKey, campSortDirection]);

  const campPageCount =
    Math.max(
      1,

      Math.ceil(
        sortedCampaigns.length /
          CAMPAIGN_PAGE_SIZE
      )
    );

  const safeCampPage =
    Math.min(
      campPage,
      campPageCount
    );

  const campRows =
    sortedCampaigns.slice(
      (
        safeCampPage -
        1
      ) *
        CAMPAIGN_PAGE_SIZE,

      safeCampPage *
        CAMPAIGN_PAGE_SIZE
    );

  const tplPageCount =
    Math.max(
      1,

      Math.ceil(
        templates.length /
          TPL_PAGE_SIZE
      )
    );

  const safeTplPage =
    Math.min(
      tplPage,
      tplPageCount
    );

  const tplRows =
    templates.slice(
      (
        safeTplPage -
        1
      ) *
        TPL_PAGE_SIZE,

      safeTplPage *
        TPL_PAGE_SIZE
    );

  /*
   * ANALYTICS TABLE
   */

  const analyticsColumns = [
    {
      key: 'remove',
      header: '',
      sortable: false,
      width: 36,
      render: (r) => (
        <button
          type="button"
          title="Удалить из истории"
          disabled={
            deleteCampaignMutation.isPending ||
            r.status === 'running' ||
            r.status === 'queued'
          }
          onClick={() => deleteCampaign(r)}
          className="flex h-6 w-6 items-center justify-center rounded text-[16px] leading-none text-muted-2 transition-colors hover:bg-[hsl(0_72%_58%/0.12)] hover:text-[hsl(0_80%_68%)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          ×
        </button>
      ),
    },
    {
      key: 'name',
      header: 'Кампания',

      render: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">
            {r.name}
          </div>
          {r.promo ? (
            <div className="truncate text-[11px] text-muted-2">
              {r.promo}
            </div>
          ) : null}
        </div>
      ),
    },

    {
      key: 'sentAt',
      header: 'Дата',
      render: (r) => {
        const raw = r.startedAt || r.createdAt || null;
        if (!raw) {
          return <span className="text-muted-2">—</span>;
        }
        const date = new Date(raw);
        if (!Number.isFinite(date.getTime())) {
          return <span className="text-muted-2">—</span>;
        }
        return (
          <span className="text-muted-foreground">
            {date.toLocaleString('ru-RU', {
              day: '2-digit',
              month: '2-digit',
              year: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        );
      },
    },

    {
      key: 'recipients',
      header: 'Разослано',
      align: 'right',
      render: (r) => (
        <span
          className="text-muted-foreground"
          title="Размер аудитории при запуске"
        >
          {num(r.recipients)}
        </span>
      ),
    },

    {
      key: 'sent',
      header: 'Получено',
      align: 'right',
      render: (r) => (
        <span
          className="text-muted-foreground"
          title="Успешно доставлено в Telegram"
        >
          {num(r.sent)}
        </span>
      ),
    },

    {
      key: 'opened',
      header: 'Открыто',
      align: 'right',
      render: (r) => (
        <span
          className="text-muted-foreground"
          title="Уникальные открытия миниаппа с кнопки рассылки"
        >
          {num(r.opened)}
        </span>
      ),
    },

    {
      key: 'promoApplications',
      header: 'Промо',
      align: 'right',
      render: (r) => (
        <span
          className="text-muted-foreground"
          title="Применения промокода из рассылки получателями (7 дней)"
        >
          {num(r.promoApplications)}
        </span>
      ),
    },

    {
      key: 'purchases',
      header: 'Покупки',
      align: 'right',
      render: (r) => (
        <span className="text-muted-foreground">{num(r.purchases)}</span>
      ),
    },

    {
      key: 'conversion',
      header: 'Конв.',
      align: 'right',
      render: (r) => (
        <span className="font-medium text-[hsl(255_100%_72%)]">
          {Number(r.conversion || 0)}%
        </span>
      ),
    },

    {
      key: 'status',
      header: 'Статус',
      render: (r) => <Badge status={r.status} />,
    },
  ];

  return (
    <div className="space-y-5">
      {/* AUDIENCE / MESSAGE / PREVIEW */}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* AUDIENCE */}

        <div className="flex h-full flex-col rounded-2xl surface-card p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-heading text-[14px] font-semibold text-foreground">
              Аудитория
            </h3>

            <div className="flex items-center gap-1.5 rounded-lg bg-[hsl(255_100%_68%/0.1)] px-2.5 py-1 text-[12px] font-medium text-[hsl(255_100%_75%)]">
              <Send className="h-3.5 w-3.5" />

              {audiencePreviewError
                ? audiencePreviewErrorLabel || 'ошибка'
                : audienceCountPending
                  ? '…'
                  : audienceIdsTruncated
                    ? `>${num(recipients)}`
                    : num(recipients)}{' '}
              получателей
            </div>
          </div>

          <div className="mt-4 space-y-4">
            <Section label="Аудитория">
              <div className="flex flex-wrap gap-2">
                {pushMeta
                  .audiences
                  .map(
                    (
                      item
                    ) => (
                      <Chip
                        key={
                          item.key
                        }
                        active={
                          audience ===
                          item.key
                        }
                        onClick={() =>
                          setAudience(
                            item.key
                          )
                        }
                      >
                        {
                          item.label
                        }
                      </Chip>
                    )
                  )}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-2">
                «Все» = клиенты + лиды. «Лиды» = все, кто открыл бота и ещё не
                сделал покупку (реферал не обязателен).
              </p>
              {audienceIdsTruncated ? (
                <p className="mt-2 text-[11px] leading-relaxed text-[hsl(0_80%_68%)]">
                  Аудитория больше лимита рассылки (
                  {num(audiencePreview?.audienceIdCap || 30000)}). Сузьте
                  фильтры — иначе отправка будет заблокирована.
                </p>
              ) : null}

              <textarea
                value={telegram}
                onChange={(e) =>
                  setTelegram(e.target.value)
                }
                rows={3}
                placeholder={
                  '@user1, @user2\nабо по одному в рядок — можна лише юзернейми'
                }
                className="input-base mt-2 resize-none"
              />
              <p className="mt-1 text-[11px] text-muted-2">
                Розсилка тільки по списку: встав @username (кома / новий рядок).
                Інші фільтри тоді можна не чіпати.
              </p>
            </Section>

            {audienceIsLeads && (
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                Для аудитории «Лиды» доступны только базовые фильтры: у лидов нет
                истории покупок, поэтому статус, категории и «любимый товар» не
                применяются.
              </p>
            )}

            <Section label="Язык">
              <div className="flex flex-wrap gap-2">
                {LANGUAGE_FILTERS.map((item) => (
                  <Chip
                    key={item.key}
                    active={languages.has(item.key)}
                    onClick={() =>
                      toggle(languages, item.key, setLanguages)
                    }
                  >
                    {item.label}
                  </Chip>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-muted-2">
                Без выбора — все языки. PL / RU по языку мини-приложения.
              </p>
            </Section>

            <Section label="Статус клиента">
              <div
                className={cn(
                  'flex flex-wrap gap-2',
                  audienceIsLeads &&
                    'pointer-events-none opacity-40'
                )}
              >
                {pushMeta
                  .statuses
                  .map(
                    (
                      item
                    ) => (
                      <Chip
                        key={
                          item.key
                        }
                        active={statuses.has(
                          item.key
                        )}
                        onClick={() =>
                          toggle(
                            statuses,
                            item.key,
                            setStatuses
                          )
                        }
                      >
                        {
                          item.label
                        }
                      </Chip>
                    )
                  )}
              </div>
            </Section>

            <Section label="Категория">
              <div
                className={cn(
                  'flex flex-wrap gap-2',
                  audienceIsLeads &&
                    'pointer-events-none opacity-40'
                )}
              >
                {pushMeta
                  .categories
                  .map(
                    (
                      item
                    ) => (
                      <Chip
                        key={
                          item.key
                        }
                        active={categories.has(
                          item.key
                        )}
                        onClick={() =>
                          toggle(
                            categories,
                            item.key,
                            setCategories
                          )
                        }
                      >
                        {
                          item.label
                        }
                      </Chip>
                    )
                  )}
              </div>
            </Section>

            <Section label="Точка покупки">
              <div className="flex flex-wrap gap-2">
                {pushMeta
                  .locations
                  .map(
                    (
                      item
                    ) => (
                      <Chip
                        key={
                          item.key
                        }
                        active={locations.has(
                          item.key
                        )}
                        onClick={() =>
                          toggle(
                            locations,
                            item.key,
                            setLocations
                          )
                        }
                      >
                        {
                          item.label
                        }
                      </Chip>
                    )
                  )}
              </div>
            </Section>

            <Section label="Доп. фильтры">
              <div className="mb-2 flex flex-wrap gap-2">
                <Chip
                  active={cashbackExpiringSoon}
                  onClick={() =>
                    setCashbackExpiringSoon((value) => !value)
                  }
                  title="Бонусы сгорят в течение 5 дней"
                >
                  Кешбэк скоро сгорит (≤5 дн.)
                </Chip>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  value={minCheck}
                  onChange={(e) => setMinCheck(e.target.value)}
                  placeholder="Ср. чек >"
                  className={cn(
                    'input-base',
                    audienceIsLeads && 'pointer-events-none opacity-40'
                  )}
                  disabled={audienceIsLeads}
                />

                <input
                  value={favProduct}
                  onChange={(e) => setFavProduct(e.target.value)}
                  placeholder="Любимый товар"
                  title="Товар, который клиент купил больше всего штук за всю историю заказов"
                  className={cn(
                    'input-base',
                    audienceIsLeads && 'pointer-events-none opacity-40'
                  )}
                  disabled={audienceIsLeads}
                />
              </div>

              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                «Любимый товар» — позиция с максимальным количеством купленных
                штук по всем успешным заказам клиента (при равенстве подходят
                все такие товары).
              </p>
            </Section>

            <div className="rounded-xl border border-[hsl(255_100%_68%/0.25)] bg-[hsl(255_100%_68%/0.08)] px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] text-muted-foreground">
                  Попадає в фільтри
                </span>
                <span className="text-[14px] font-semibold text-[hsl(255_100%_75%)]">
                  {audiencePreviewError
                    ? audiencePreviewErrorLabel || 'помилка'
                    : audienceCountPending
                      ? '…'
                      : num(recipients)}
                </span>
              </div>
              {!audiencePreviewError &&
              !audienceCountPending &&
              hasAudienceLanguageStats ? (
                <p className="mt-1 text-[11px] text-muted-2">
                  PL {num(audienceLangPl)} · RU {num(audienceLangRu)}
                  {audienceLangUnknown > 0
                    ? ` · н/д ${num(audienceLangUnknown)}`
                    : ''}
                </p>
              ) : null}
              {audienceLangUnknown > 0 &&
              !audiencePreviewError &&
              !audienceCountPending ? (
                <p className="mt-1 text-[11px] leading-relaxed text-muted-2">
                  н/д — мова ще не збережена (після відкриття мініапу). Їм піде
                  текст мови за замовчуванням (RU), якщо є обидва варіанти.
                </p>
              ) : null}
              {requestedUsernames > 0 ? (
                <p className="mt-1 text-[11px] text-muted-2">
                  Зі списку: {matchedUsernames} / {requestedUsernames}
                  {missingUsernames.length > 0
                    ? ` · не знайдено: ${missingUsernames
                        .slice(0, 5)
                        .map((u) => `@${u}`)
                        .join(', ')}${
                        missingUsernames.length > 5
                          ? ` +${missingUsernames.length - 5}`
                          : ''
                      }`
                    : ''}
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-muted-2">
                  Оновлюється при зміні фільтрів
                </p>
              )}
            </div>
          </div>
        </div>

        {/* MESSAGE */}

        <div className="flex h-full flex-col rounded-2xl surface-card p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-heading text-[14px] font-semibold text-foreground">
              Сообщение
            </h3>
            <div className="inline-flex rounded-lg border border-border bg-[hsl(232_26%_7%)] p-0.5">
              {[
                { key: 'pl', label: 'PL' },
                { key: 'ru', label: 'RU' },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setMessageLang(item.key)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                    messageLang === item.key
                      ? 'bg-[hsl(255_100%_68%/0.18)] text-foreground'
                      : 'text-muted-2 hover:text-foreground'
                  )}
                >
                  {item.label}
                  {(item.key === 'pl' ? bodyPl : bodyRu).trim()
                    ? ' ✓'
                    : ''}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <Field
              label={
                messageLang === 'pl'
                  ? 'Текст (PL)'
                  : 'Текст (RU)'
              }
            >
              <div className="mb-1.5 flex flex-wrap gap-1">
                {[
                  { label: 'B', tip: 'Жирный *текст*', before: '*', after: '*' },
                  { label: 'I', tip: 'Курсив _текст_', before: '_', after: '_' },
                  { label: 'спойлер', tip: 'Спойлер ||текст||', before: '||', after: '||' },
                  { label: '`', tip: 'Код', before: '`', after: '`' },
                  { label: '🔗', tip: 'Посилання', before: '[текст](', after: 'https://)' },
                  { label: 'U', tip: 'Подчёркнутый __текст__', before: '__', after: '__' },
                  { label: 'S', tip: 'Зачёркнутый ~~текст~~', before: '~~', after: '~~' },
                  { label: '❝', tip: 'Цитата', before: '> ', after: '' },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    title={item.tip}
                    onClick={() => insertMarkdown(item.before, item.after)}
                    className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-border px-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <textarea
                ref={bodyRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                placeholder={
                  messageLang === 'pl'
                    ? '**Tęsknimy za smakami?**\n\nWróć i weź −15% na ELF KING.'
                    : '**Заголовок**\n\nТекст з markdown…'
                }
                className="input-base resize-none font-mono text-[12px]"
              />
              <p className="mt-1 text-[11px] text-muted-2">
                Заповніть PL і RU — кожен отримає свій варіант. Без мови в профілі
                → RU (якщо є), інакше PL.
              </p>
            </Field>

            <PushPromoCreator
              messageTexts={[bodyPl, bodyRu]}
              onCreated={(code) => {
                if (!code) return;
                setBody((current) => {
                  const chunk = `\`${code}\``;
                  const value = String(current || '');
                  // Не дублювати, якщо код уже в тексті
                  if (
                    new RegExp(
                      `(?:промокод|\\\`${code}\\\`)`,
                      'i'
                    ).test(value) &&
                    value.toUpperCase().includes(String(code).toUpperCase())
                  ) {
                    return value;
                  }
                  return value
                    ? `${value}${value.endsWith('\n') ? '' : '\n\n'}Промокод: ${chunk}`
                    : `Промокод: ${chunk}`;
                });
              }}
            />

            <Field label="Инлайн-кнопки (миниапп)">
              <div className="space-y-2">
                {inlineButtons.map((btn, index) => (
                  <div
                    key={`btn-${index}`}
                    className="grid grid-cols-1 gap-2 rounded-lg border border-border-soft bg-[hsl(232_26%_6%)] p-2 sm:grid-cols-[1fr_1fr_auto]"
                  >
                    <input
                      value={btn.text}
                      onChange={(e) => {
                        const next = [...inlineButtons];
                        next[index] = { ...next[index], text: e.target.value };
                        setInlineButtons(next);
                      }}
                      placeholder="Текст кнопки"
                      className="input-base"
                    />
                    <input
                      value={btn.path}
                      onChange={(e) => {
                        const next = [...inlineButtons];
                        next[index] = {
                          ...next[index],
                          kind: 'web_app',
                          path: e.target.value,
                        };
                        setInlineButtons(next);
                      }}
                      placeholder="Шлях / або /catalog"
                      className="input-base"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setInlineButtons((rows) =>
                          rows.filter((_, i) => i !== index)
                        )
                      }
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-2 text-[11px] text-muted-2 hover:text-foreground"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setInlineButtons((rows) => [
                      ...rows,
                      { text: '', kind: 'web_app', path: '/' },
                    ])
                  }
                  className="text-[12px] font-medium text-[hsl(255_100%_72%)] hover:underline underline-offset-2"
                >
                  + Добавить кнопку
                </button>
                <p className="text-[11px] text-muted-2">
                  Кнопка відкриває мініапп (WEBAPP_URL + шлях). Приклади: `/`,
                  `/catalog`, `/promo`
                </p>
              </div>
            </Field>

            <div className="space-y-2">
              <label
                className={cn(
                  'inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-[12px] text-muted-foreground hover:text-foreground',
                  mediaUploading && 'pointer-events-none opacity-50'
                )}
              >
                <Paperclip className="h-3.5 w-3.5" />
                {mediaUploading
                  ? 'Загрузка…'
                  : mediaFile
                    ? 'Заменить медиа'
                    : 'Медиа'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={selectMedia}
                  className="hidden"
                />
              </label>

              {mediaFile && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border-soft bg-[hsl(232_26%_6%)] px-3 py-2">
                  <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                    {mediaFile.name}
                  </span>
                  <button
                    type="button"
                    onClick={removeMedia}
                    className="shrink-0 text-[11px] text-muted-2 hover:text-foreground"
                  >
                    Удалить
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* PREVIEW */}

        <div className="flex h-full flex-col rounded-2xl surface-card p-5">
          <h3 className="font-heading text-[14px] font-semibold text-foreground">
            Предпросмотр
          </h3>

          <div className="mt-5 flex justify-center">
            <div className="relative w-full max-w-[220px] rounded-[28px] border border-border bg-[hsl(232_26%_6%)] p-3 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)]">
              <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-border" />

              <div className="flex items-center gap-2 text-[10px] text-muted-2">
                <Smartphone className="h-3 w-3" />
                ElfDuck · сейчас
              </div>

              <div className="mt-2 rounded-xl bg-[hsl(234_22%_11%)] p-3">
                {mediaPreviewUrl && (
                  <img
                    src={mediaPreviewUrl}
                    alt="Медиа рассылки"
                    className="mb-2 max-h-40 w-full rounded-lg object-cover"
                  />
                )}
                <div
                  className={PUSH_PREVIEW_CLASS}
                  dangerouslySetInnerHTML={{
                    __html: renderPushPreviewHtml(body || 'Текст сообщения'),
                  }}
                />
                {inlineButtons.filter((b) => b.text?.trim()).length > 0 ? (
                  <div className="mt-2 space-y-1">
                    {inlineButtons
                      .filter((b) => b.text?.trim())
                      .map((b, i) => (
                        <div
                          key={`prev-btn-${i}`}
                          className="rounded-md border border-[hsl(255_100%_68%/0.35)] px-2 py-1 text-center text-[10px] font-medium text-[hsl(255_100%_75%)]"
                        >
                          {b.text}
                        </div>
                      ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-auto space-y-2 pt-5">
            <button
              type="button"
              onClick={
                openCreateTpl
              }
              disabled={
                !body.trim() ||
                createTemplateMutation
                  .isPending
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-4 w-4" />

              Создать шаблон
            </button>

            <button
              type="button"
              onClick={
                sendCampaign
              }
              disabled={
                recipients <= 0 ||
                !audienceReady ||
                !hasMessageText ||
                sendCampaignMutation.isPending
              }
              title={
                !hasMessageText
                  ? 'Введите текст PL и/или RU'
                  : audienceIdsTruncated
                    ? 'Аудитория больше лимита — сузьте фильтры'
                    : !audienceReady
                      ? 'Считаем аудиторию…'
                      : recipients <= 0
                        ? 'Нет получателей по выбранным фильтрам (проверьте поле @telegram и чипы)'
                        : undefined
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[hsl(255_100%_68%)] to-[hsl(280_90%_60%)] px-4 py-2 text-[13px] font-medium text-white shadow-[0_4px_20px_-6px_hsl(255_100%_68%)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />

              {sendCampaignMutation.isPending
                ? 'Запускаем…'
                : `Отправить (${
                    audienceCountPending ? '…' : num(recipients)
                  })`}
            </button>
          </div>
        </div>
      </div>

      {/* TEMPLATES */}

      <div className="rounded-2xl surface-card p-2">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <span className="text-[13px] font-medium text-foreground">
            Шаблоны
          </span>
          <span className="text-[12px] text-muted-2">
            · {templates.length}
          </span>
          <span className="text-[11px] text-muted-2">
            — нажмите строку для рассылки или привязки к авто-событию ниже
          </span>
        </div>

<div className="space-y-2 px-2 pb-2">
  {tplRows.map(
    (template) => (
      <div
        key={template.id}
        className={cn(
          'relative w-full rounded-lg border transition-all',

          activeTpl ===
            template.id
            ? 'border-[hsl(255_100%_68%/0.4)] bg-[hsl(255_100%_68%/0.08)]'
            : 'border-border-soft bg-[hsl(232_26%_6%)] hover:border-[hsl(255_100%_68%/0.25)]'
        )}
      >
        {/* Клік по рядку = застосувати шаблон до форми розсилки */}
        <button
          type="button"
          onClick={() =>
            applyTemplate(
              template
            )
          }
          title="Нажмите, чтобы применить шаблон к форме рассылки"
          className="w-full p-3 pr-14 text-left"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-[13px] font-medium text-foreground">
              {template.name ||
                template.title ||
                'Шаблон'}
            </span>

            <span className="shrink-0 text-[11px] font-medium text-[hsl(255_100%_72%)]">
              {activeTpl === template.id
                ? 'Выбран'
                : 'Применить'}
            </span>
          </div>

          {(template.language ||
            template.suggestedAudience ||
            template.isDefault) && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {template.language ? (
                <span className="rounded border border-border-soft px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-2">
                  {String(template.language).toUpperCase()}
                </span>
              ) : null}
              {template.suggestedAudience === 'leads' ? (
                <span className="rounded border border-[hsl(255_100%_68%/0.35)] bg-[hsl(255_100%_68%/0.1)] px-1.5 py-0.5 text-[10px] text-[hsl(255_100%_75%)]">
                  Лиды
                </span>
              ) : template.suggestedAudience ? (
                <span className="rounded border border-border-soft px-1.5 py-0.5 text-[10px] text-muted-2">
                  {template.suggestedAudience}
                </span>
              ) : null}
              {template.isDefault ? (
                <span className="rounded border border-border-soft px-1.5 py-0.5 text-[10px] text-muted-2">
                  Готовый
                </span>
              ) : null}
            </div>
          )}

          <div
            className={`${PUSH_PREVIEW_CLASS} mt-1 line-clamp-4 text-[12px]`}
            dangerouslySetInnerHTML={{
              __html: renderPushPreviewHtml(
                template.preview || template.text || ''
              ),
            }}
          />

          <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-2">
            <span>
              Использован:{' '}
              {num(
                template.used ||
                  0
              )}{' '}
              раз
            </span>

            {template.lastUsed && (
              <span>
                · Последний:{' '}
                {
                  template.lastUsed
                }
              </span>
            )}
          </div>
        </button>

        {/* Удаление шаблона */}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();

            deleteTemplate(
              template
            );
          }}
          disabled={
            deleteTemplateMutation
              .isPending
          }
          title="Удалить шаблон"
          aria-label="Удалить шаблон"
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-2 transition-colors hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  )}
</div>

        <Pagination
          page={
            safeTplPage
          }
          pageCount={
            tplPageCount
          }
          total={
            templates.length
          }
          pageSize={
            TPL_PAGE_SIZE
          }
          onPageChange={
            setTplPage
          }
        />
      </div>

      <PushAutomationsPanel templates={templates} />

      {/* CAMPAIGNS */}

      <div className="rounded-2xl surface-card p-2">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <div className="text-[13px] font-medium text-foreground">
              История рассылок
            </div>
            <p className="mt-0.5 text-[11px] text-muted-2">
              Разослано · получено · открыто апку · применения промо
            </p>
          </div>
          <button
            type="button"
            disabled={
              !campaigns.length ||
              clearCampaignsMutation.isPending
            }
            onClick={() => {
              if (
                !window.confirm(
                  'Очистить историю рассылок? Это удалит записи кампаний из аналитики.'
                )
              ) {
                return;
              }
              clearCampaignsMutation.mutate();
            }}
            className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:border-[hsl(0_72%_58%/0.35)] hover:text-[hsl(0_80%_68%)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {clearCampaignsMutation.isPending
              ? 'Очищаем…'
              : 'Очистить историю'}
          </button>
        </div>

        <div className="hidden md:block">
          <DataTable
            columns={
              analyticsColumns
            }
            rows={
              campRows
            }
            dense
            sortKey={campSortKey}
            sortDirection={campSortDirection}
            onSort={toggleCampSort}
          />
        </div>

        <div className="space-y-2.5 p-1 md:hidden">
          {campRows.map(
            (r) => (
              <CampaignMobileRow
                key={
                  r.id
                }
                r={r}
                onDelete={deleteCampaign}
                deleting={deleteCampaignMutation.isPending}
              />
            )
          )}
        </div>

        <Pagination
          page={
            safeCampPage
          }
          pageCount={
            campPageCount
          }
          total={
            campaigns.length
          }
          pageSize={
            CAMPAIGN_PAGE_SIZE
          }
          onPageChange={
            setCampPage
          }
        />
      </div>

      {/* AUTH MODAL */}

      <Dialog
        open={
          authModalOpen
        }
        onOpenChange={
          setAuthModalOpen
        }
      >
        <DialogContent className="max-w-sm w-[calc(100%-1.5rem)]">
          <DialogHeader>
            <DialogTitle>
              Вход в CRM
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-muted-2">
                Пароль администратора
              </label>

              <input
                type="password"
                value={
                  authPassword
                }
                onChange={(
                  e
                ) =>
                  setAuthPassword(
                    e.target
                      .value
                  )
                }
                onKeyDown={(
                  e
                ) => {
                  if (
                    e.key ===
                    'Enter'
                  ) {
                    submitCrmLogin();
                  }
                }}
                className="input-base mt-1.5"
                autoFocus
              />
            </div>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() =>
                setAuthModalOpen(
                  false
                )
              }
              className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Отмена
            </button>

            <button
              type="button"
              onClick={
                submitCrmLogin
              }
              disabled={
                !authPassword.trim() ||
                loginMutation
                  .isPending
              }
              className="inline-flex items-center rounded-lg bg-gradient-to-r from-[hsl(255_100%_68%)] to-[hsl(280_90%_60%)] px-4 py-2 text-[13px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loginMutation
                .isPending
                ? 'Входим…'
                : 'Войти'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CREATE TEMPLATE MODAL */}

      <Dialog
        open={
          tplModalOpen
        }
        onOpenChange={
          setTplModalOpen
        }
      >
        <DialogContent className="max-w-md w-[calc(100%-1.5rem)]">
          <DialogHeader>
            <DialogTitle>
              Новый шаблон
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-muted-2">
                Название шаблона
              </label>

              <input
                value={
                  tplName
                }
                onChange={(
                  e
                ) =>
                  setTplName(
                    e.target
                      .value
                  )
                }
                placeholder="Например: Новый вкус недели"
                className="input-base mt-1.5"
                autoFocus
              />
            </div>

            <div className="rounded-lg border border-border-soft bg-[hsl(232_26%_6%)] p-3">
              <div className="text-[11px] uppercase tracking-wider text-muted-2">
                Содержимое
              </div>

              <div
                className={`${PUSH_PREVIEW_CLASS} mt-1 text-[12px]`}
                dangerouslySetInnerHTML={{
                  __html: renderPushPreviewHtml(body || 'Текст сообщения'),
                }}
              />

              {inlineButtons.filter((b) => b.text?.trim()).length > 0 ? (
                <div className="mt-2 space-y-1">
                  {inlineButtons
                    .filter((b) => b.text?.trim())
                    .map((b, i) => (
                      <div
                        key={`tpl-btn-${i}`}
                        className="rounded border border-border px-2 py-1 text-[11px] text-[hsl(255_100%_72%)]"
                      >
                        {b.text} → {b.path || '/'}
                      </div>
                    ))}
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() =>
                setTplModalOpen(
                  false
                )
              }
              className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Отмена
            </button>

            <button
              type="button"
              onClick={
                confirmCreateTpl
              }
              disabled={
                !tplName.trim() ||
                !body.trim() ||
                createTemplateMutation
                  .isPending
              }
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[hsl(255_100%_68%)] to-[hsl(280_90%_60%)] px-4 py-2 text-[13px] font-medium text-white shadow-[0_4px_20px_-6px_hsl(255_100%_68%)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createTemplateMutation
                .isPending
                ? 'Создаём…'
                : 'Создать'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function extractPromoCodesFromTexts(texts = []) {
  const joined = (Array.isArray(texts) ? texts : [texts])
    .map((value) => String(value || ''))
    .join('\n');
  const found = new Set();
  for (const match of joined.matchAll(/`([A-Za-z0-9_-]{3,64})`/g)) {
    found.add(String(match[1] || '').toUpperCase());
  }
  for (const match of joined.matchAll(
    /(?:промокод|promo(?:\s*code)?)\s*[:：]?\s*`?([A-Za-z0-9_-]{3,64})`?/gi
  )) {
    found.add(String(match[1] || '').toUpperCase());
  }
  return [...found].filter(Boolean);
}

function PushPromoCreator({ onCreated, messageTexts = [] }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [code, setCode] = useState('');
  const [amountZl, setAmountZl] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [noExpiry, setNoExpiry] = useState(true);
  const [maxActivations, setMaxActivations] = useState('');
  const [maxActivationsPerUser, setMaxActivationsPerUser] = useState('1');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const { data: promoListData, refetch: refetchPromos } = useQuery({
    queryKey: ['crm-promo-codes'],
    queryFn: () => crmFetch('/crm/promo-codes'),
    staleTime: 30_000,
  });

  const allPromos = Array.isArray(promoListData?.promoCodes)
    ? promoListData.promoCodes
    : [];
  const recentPromos = allPromos.slice(0, 12);
  const promoCount = allPromos.length;

  const messageTextsKey = Array.isArray(messageTexts)
    ? messageTexts.map((value) => String(value || '')).join('\0')
    : String(messageTexts || '');
  const codesInMessage = useMemo(
    () => extractPromoCodesFromTexts(messageTexts),
    // messageTextsKey covers content changes when parent passes a fresh array
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messageTextsKey]
  );
  const knownCodeSet = useMemo(
    () =>
      new Set(
        allPromos
          .map((row) => String(row?.code || '').trim().toUpperCase())
          .filter(Boolean)
      ),
    [allPromos]
  );
  const appliedCodes = codesInMessage.filter(
    (value) => knownCodeSet.size === 0 || knownCodeSet.has(value)
  );
  const appliedLabel =
    appliedCodes.length === 0
      ? ''
      : appliedCodes.length === 1
        ? appliedCodes[0]
        : appliedCodes.join(', ');

  const createPromo = async () => {
    const normalizedCode = String(code || '')
      .trim()
      .toUpperCase();
    const amount = Number(amountZl);
    const globalLimit = Number(maxActivations || 0);
    const perUserLimit = Number(
      maxActivationsPerUser === '' ? 1 : maxActivationsPerUser
    );

    if (!normalizedCode || normalizedCode.length < 3) {
      toast({
        title: 'Укажите код промокода',
        variant: 'destructive',
      });
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        title: 'Укажите сумму промокода (zł)',
        variant: 'destructive',
      });
      return;
    }

    if (!Number.isFinite(perUserLimit) || perUserLimit < 0) {
      toast({
        title: 'Лимит на клиента должен быть числом (0 = без лимита)',
        variant: 'destructive',
      });
      return;
    }

    let expiresAtIso = null;
    if (!noExpiry) {
      if (!expiresAt) {
        toast({
          title: 'Укажите срок действия или включите «Бессрочный»',
          variant: 'destructive',
        });
        return;
      }
      const parsed = new Date(expiresAt);
      if (!Number.isFinite(parsed.getTime()) || parsed.getTime() <= Date.now()) {
        toast({
          title: 'Срок действия должен быть в будущем',
          variant: 'destructive',
        });
        return;
      }
      expiresAtIso = parsed.toISOString();
    }

    setLoading(true);

    try {
      const result = await crmFetchJson('/crm/promo-codes', {
        method: 'POST',
        body: JSON.stringify({
          code: normalizedCode,
          amountZl: amount,
          expiresAt: expiresAtIso,
          maxActivations:
            Number.isFinite(globalLimit) && globalLimit > 0 ? globalLimit : 0,
          maxActivationsPerUser: Number.isFinite(perUserLimit)
            ? perUserLimit
            : 1,
          note: String(note || '').trim(),
        }),
      });

      const createdCode = String(
        result?.promoCode?.code || normalizedCode
      );

      toast({
        title: `Промокод ${createdCode} создан`,
      });

      onCreated?.(createdCode);
      setOpen(false);
      setCode('');
      setAmountZl('');
      setExpiresAt('');
      setNoExpiry(true);
      setMaxActivations('');
      setMaxActivationsPerUser('1');
      setNote('');
      refetchPromos();
    } catch (error) {
      toast({
        title: 'Не удалось создать промокод',
        description: error?.message || 'PROMO_CODE_CREATE_FAILED',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-border-soft bg-[hsl(232_26%_6%)]">
      <button
        type="button"
        onClick={() => setPanelOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
        aria-expanded={panelOpen}
      >
        <span className="min-w-0 text-[12px] font-medium text-foreground">
          Промокоды
          {promoCount > 0 ? (
            <span className="ml-1.5 text-muted-2">· {promoCount}</span>
          ) : null}
          {appliedLabel ? (
            <span className="ml-1.5 inline-flex max-w-[160px] truncate align-middle rounded-md bg-[hsl(255_100%_68%/0.14)] px-1.5 py-0.5 text-[10px] font-semibold text-[hsl(255_100%_75%)]">
              {appliedLabel}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-[11px] text-[hsl(255_100%_72%)]">
          {panelOpen ? 'Свернуть' : 'Открыть'}
        </span>
      </button>

      {panelOpen ? (
        <div className="space-y-2 border-t border-border-soft px-3 pb-3 pt-2.5">
          {appliedLabel ? (
            <div className="rounded-lg border border-[hsl(255_100%_68%/0.28)] bg-[hsl(255_100%_68%/0.08)] px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-[0.04em] text-muted-2">
                В сообщении
              </div>
              <div className="mt-0.5 text-[13px] font-semibold text-[hsl(255_100%_75%)]">
                {appliedLabel}
              </div>
              <p className="mt-1 text-[11px] text-muted-2">
                Клик по коду в списке вставляет его в активный язык (PL/RU).
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-muted-2">
              Создайте код или кликните по существующему — он попадёт в текст
              сообщения.
            </p>
          )}

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="text-[12px] font-medium text-[hsl(255_100%_72%)] hover:underline underline-offset-2"
          >
            {open ? 'Скрыть форму' : '+ Создать промокод'}
          </button>

          {open ? (
            <div className="space-y-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Код (например WELCOME15)"
                className="input-base"
              />
              <input
                value={amountZl}
                onChange={(e) => setAmountZl(e.target.value)}
                placeholder="Сумма, zł"
                type="number"
                min="1"
                step="1"
                className="input-base"
              />

              <div className="space-y-1.5 rounded-lg border border-border-soft p-2.5">
                <label className="flex items-center gap-2 text-[12px] text-foreground">
                  <input
                    type="checkbox"
                    checked={noExpiry}
                    onChange={(e) => {
                      setNoExpiry(e.target.checked);
                      if (e.target.checked) setExpiresAt('');
                    }}
                    className="rounded border-border"
                  />
                  Бессрочный (без даты окончания)
                </label>
                {!noExpiry ? (
                  <input
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    type="datetime-local"
                    title="Срок действия"
                    style={{ colorScheme: 'dark' }}
                    className="input-base"
                  />
                ) : (
                  <p className="text-[11px] leading-relaxed text-muted-2">
                    Бессрочность не отменяет лимиты активаций — только дату
                    окончания.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] text-muted-2">
                    Общий лимит (все клиенты)
                  </label>
                  <input
                    value={maxActivations}
                    onChange={(e) => setMaxActivations(e.target.value)}
                    placeholder="0 = без общего лимита"
                    type="number"
                    min="0"
                    step="1"
                    className="input-base"
                    title="Сколько раз промокод могут использовать все клиенты вместе"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-muted-2">
                    Лимит на одного клиента
                  </label>
                  <input
                    value={maxActivationsPerUser}
                    onChange={(e) => setMaxActivationsPerUser(e.target.value)}
                    placeholder="1"
                    type="number"
                    min="0"
                    step="1"
                    className="input-base"
                    title="Сколько раз каждый клиент может использовать этот промокод (0 = без лимита)"
                  />
                </div>
              </div>

              <p className="text-[11px] leading-relaxed text-muted-2">
                Для авторассылки после первого заказа: бессрочный, общий лимит =
                0, на клиента = 1 (например 15 zł).
              </p>

              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Заметка"
                className="input-base"
              />
              <button
                type="button"
                onClick={createPromo}
                disabled={loading}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-[12px] font-medium text-foreground transition-colors hover:border-[hsl(255_100%_68%/0.35)] disabled:opacity-50"
              >
                {loading ? 'Создаём…' : 'Сохранить промокод'}
              </button>
            </div>
          ) : null}

          {recentPromos.length > 0 ? (
            <div className={open ? 'border-t border-border-soft pt-2' : ''}>
              <button
                type="button"
                onClick={() => setListOpen((value) => !value)}
                className="mb-1.5 flex w-full items-center justify-between text-left text-[11px] text-muted-2"
              >
                <span>
                  Созданные промокоды · {recentPromos.length}
                  {promoCount > recentPromos.length
                    ? ` из ${promoCount}`
                    : ''}
                </span>
                <span className="text-[hsl(255_100%_72%)]">
                  {listOpen ? 'Скрыть' : 'Показать'}
                </span>
              </button>

              {listOpen ? (
                <div className="max-h-48 space-y-1.5 overflow-y-auto pr-0.5">
                  {recentPromos.map((row) => {
                    const max = Number(row.maxActivations || 0);
                    const used = Number(row.activationsCount || 0);
                    const perUser = Number(
                      row.maxActivationsPerUser === undefined ||
                        row.maxActivationsPerUser === null
                        ? 1
                        : row.maxActivationsPerUser
                    );
                    const globalLabel =
                      max > 0 ? `${used}/${max}` : `${used}/∞`;
                    const perUserLabel =
                      perUser > 0 ? `${perUser}/кл.` : '∞/кл.';
                    const rowCode = String(row.code || '')
                      .trim()
                      .toUpperCase();
                    const isApplied = appliedCodes.includes(rowCode);
                    return (
                      <div
                        key={row.id || row.code}
                        className={cn(
                          'flex items-center gap-1.5 rounded-md border px-2 py-1',
                          isApplied
                            ? 'border-[hsl(255_100%_68%/0.45)] bg-[hsl(255_100%_68%/0.1)]'
                            : 'border-border'
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => onCreated?.(row.code)}
                          className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                          title={[
                            isApplied ? 'Уже в сообщении' : 'Вставить в сообщение',
                            `${row.amountZl} zł`,
                            row.expiresAt
                              ? `до ${new Date(row.expiresAt).toLocaleString('ru')}`
                              : 'бессрочный',
                            `общий ${globalLabel}`,
                            `на клиента ${perUserLabel}`,
                            row.note || '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        >
                          <span className="truncate font-medium text-foreground">
                            {row.code}
                            {isApplied ? (
                              <span className="ml-1.5 text-[10px] font-semibold text-[hsl(255_100%_75%)]">
                                в тексте
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-muted-2">
                            {row.amountZl} zł · {globalLabel} · {perUserLabel}
                          </span>
                        </button>
                        <button
                          type="button"
                          title="Удалить промокод"
                          onClick={async () => {
                            const id = String(row.id || '').trim();
                            if (!id) return;
                            if (
                              !window.confirm(
                                `Удалить промокод «${row.code}»? Это действие нельзя отменить.`
                              )
                            ) {
                              return;
                            }
                            try {
                              await crmFetchJson(
                                `/crm/promo-codes/${encodeURIComponent(id)}`,
                                { method: 'DELETE' }
                              );
                              toast({
                                title: `Промокод ${row.code} удалён`,
                              });
                              refetchPromos();
                            } catch (error) {
                              toast({
                                title: 'Не удалось удалить промокод',
                                description:
                                  error?.message || 'DELETE_FAILED',
                                variant: 'destructive',
                              });
                            }
                          }}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-2 transition-colors hover:bg-[hsl(0_72%_58%/0.12)] hover:text-[hsl(0_80%_68%)]"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const PUSH_AUTOMATION_EVENTS = [
  {
    trigger: 'first_purchase',
    label: 'Первая покупка',
    delayMode: 'minutes',
    hint: '0 — сразу после выполнения заказа. 1440 = 1 день.',
  },
  {
    trigger: 'lead_followup',
    label: 'Лид без покупки',
    delayMode: 'days',
    hint: 'Отсчёт с первого захода в миниапп. Если клиент успеет купить — сообщение не уйдёт.',
  },
  {
    trigger: 'cashback_expiring',
    label: 'Кэшбек скоро сгорит',
    delayMode: 'none',
    hint: 'Один раз за 5 дней до сгорания. В шаблоне: {amount}, {days}, {date}.',
  },
];

function normalizeAutomationButtons(buttons = []) {
  return (Array.isArray(buttons) ? buttons : []).map((btn) => ({
    text: String(btn?.text || ''),
    kind: btn?.kind === 'url' ? 'url' : 'web_app',
    path: String(btn?.path || '/'),
    url: String(btn?.url || ''),
  }));
}

function buildAutomationMessageFromTemplate(template, templateId) {
  if (!template) return null;

  const lang =
    String(template.language || '').trim().toLowerCase() === 'pl' ? 'pl' : 'ru';
  const text = String(template.text || template.preview || '').trim();
  const textPl = lang === 'pl' ? text : String(template.textPl || '').trim();
  const textRu = lang === 'ru' ? text : String(template.textRu || '').trim();
  const promoCodes = extractPromoCodesFromTexts([
    textPl,
    textRu,
    template.title,
    template.name,
  ]);

  return {
    title: String(template.title || template.name || '').trim(),
    text: textPl || textRu || text,
    textPl,
    textRu,
    defaultLanguage: 'ru',
    promo: promoCodes[0] || '',
    buttons: normalizeAutomationButtons(template.buttons),
    templateId: String(templateId || template.id || '').trim(),
    photoUrl: String(template.photoUrl || template.photoPreviewUrl || '').trim(),
    photoFileId: String(template.photoFileId || '').trim(),
  };
}

function automationMessageHasContent(message) {
  if (!message) return false;
  return Boolean(
    String(message.title || '').trim() ||
      String(message.text || '').trim() ||
      String(message.textPl || '').trim() ||
      String(message.textRu || '').trim() ||
      String(message.promo || '').trim()
  );
}

function defaultDelayMinutesForEvent(event, row) {
  if (row?.updatedAt) {
    return Math.max(0, Number(row.delayMinutes || 0));
  }
  if (event.delayMode === 'days') return 2880;
  return 0;
}

function PushAutomationsPanel({ templates = [] }) {
  const draftsRef = useRef({});
  const [activeTrigger, setActiveTrigger] = useState('first_purchase');
  const [enabled, setEnabled] = useState(false);
  const [delayMinutes, setDelayMinutes] = useState('0');
  const [templateId, setTemplateId] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['crm-push-automations'],
    queryFn: () => crmFetch('/crm/push/automations'),
    staleTime: 30_000,
  });

  const activeEvent =
    PUSH_AUTOMATION_EVENTS.find((item) => item.trigger === activeTrigger) ||
    PUSH_AUTOMATION_EVENTS[0];
  const activeRow = data?.automations?.[activeTrigger];

  const persistDraft = () => {
    draftsRef.current[activeTrigger] = {
      enabled,
      delayMinutes,
      templateId,
    };
  };

  const loadTrigger = (trigger, row, event) => {
    const draft = draftsRef.current[trigger];
    if (draft) {
      setEnabled(draft.enabled === true);
      setDelayMinutes(String(draft.delayMinutes ?? '0'));
      setTemplateId(String(draft.templateId || ''));
      return;
    }

    setEnabled(row?.enabled === true);
    setDelayMinutes(String(defaultDelayMinutesForEvent(event, row)));
    setTemplateId(String(row?.message?.templateId || ''));
  };

  useEffect(() => {
    if (isLoading) return;
    if (draftsRef.current[activeTrigger]) return;
    const event =
      PUSH_AUTOMATION_EVENTS.find((item) => item.trigger === activeTrigger) ||
      PUSH_AUTOMATION_EVENTS[0];
    loadTrigger(activeTrigger, activeRow, event);
  }, [activeTrigger, isLoading]);

  const selectedTemplate = (templates || []).find(
    (item) => item.id === templateId
  );
  const previewMessage = useMemo(() => {
    if (selectedTemplate) {
      return buildAutomationMessageFromTemplate(selectedTemplate, templateId);
    }
    if (automationMessageHasContent(activeRow?.message)) {
      return activeRow.message;
    }
    return null;
  }, [selectedTemplate, templateId, activeRow?.message]);

  const previewLang =
    String(previewMessage?.textPl || '').trim() &&
    !String(previewMessage?.textRu || '').trim()
      ? 'pl'
      : 'ru';
  const previewText =
    previewLang === 'pl'
      ? String(previewMessage?.textPl || previewMessage?.text || '')
      : String(previewMessage?.textRu || previewMessage?.text || '');
  const previewButtons = normalizeAutomationButtons(previewMessage?.buttons);
  const delayDays = Math.round((Number(delayMinutes || 0) / 1440) * 10) / 10;

  const queryClient = useQueryClient();
  const saveMutation = useMutation({
    mutationFn: () => {
      const template = (templates || []).find((item) => item.id === templateId);
      const message =
        buildAutomationMessageFromTemplate(template, templateId) ||
        (automationMessageHasContent(activeRow?.message)
          ? activeRow.message
          : null);

      if (!message) {
        throw new Error('Выберите шаблон из списка выше');
      }

      return crmFetch(`/crm/push/automations/${activeTrigger}`, {
        method: 'PUT',
        body: JSON.stringify({
          enabled,
          delayMinutes: Number(delayMinutes || 0),
          message,
        }),
      });
    },
    onSuccess: async () => {
      delete draftsRef.current[activeTrigger];
      await queryClient.invalidateQueries({
        queryKey: ['crm-push-automations'],
      });
      toast({ title: 'Авторассылка сохранена' });
    },
    onError: (error) => {
      toast({
        title: 'Не удалось сохранить',
        description: error?.message || 'SAVE_FAILED',
        variant: 'destructive',
      });
    },
  });

  const switchTrigger = (trigger) => {
    if (trigger === activeTrigger) return;
    persistDraft();
    setActiveTrigger(trigger);
  };

  const canSave =
    Boolean(templateId && selectedTemplate) ||
    automationMessageHasContent(activeRow?.message);

  return (
    <div className="rounded-2xl surface-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-[14px] font-semibold text-foreground">
            Автоматическая рассылка
          </h3>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
            Сначала сохраните шаблон в блоке выше, затем выберите событие и
            привяжите шаблон. Текст заново вводить не нужно — только задержку и
            вкл/выкл.
          </p>
        </div>
        <Chip
          active={enabled}
          onClick={() => setEnabled((value) => !value)}
        >
          {enabled ? 'Включено' : 'Выключено'}
        </Chip>
      </div>

      {isLoading ? (
        <p className="mt-4 text-[12px] text-muted-2">Загрузка…</p>
      ) : (
        <div className="mt-4 space-y-4">
          <Field label="Событие">
            <div className="flex flex-wrap gap-2">
              {PUSH_AUTOMATION_EVENTS.map((event) => (
                <button
                  key={event.trigger}
                  type="button"
                  onClick={() => switchTrigger(event.trigger)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors',
                    activeTrigger === event.trigger
                      ? 'border-[hsl(255_100%_68%/0.5)] bg-[hsl(255_100%_68%/0.1)] text-foreground'
                      : 'border-border text-muted-2 hover:text-foreground'
                  )}
                >
                  {event.label}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
            <div className="space-y-3">
              <Field label="Шаблон">
                <select
                  value={templateId}
                  onChange={(event) => setTemplateId(event.target.value)}
                  className="input-base"
                >
                  <option value="">Выберите сохранённый шаблон…</option>
                  {(templates || []).map((template) => (
                    <option key={template.id} value={template.id}>
                      {String(template.language || 'ru').toUpperCase()} ·{' '}
                      {template.name || template.title || 'Без названия'}
                    </option>
                  ))}
                </select>
                {!templates.length ? (
                  <p className="mt-1 text-[11px] text-amber-200/80">
                    Нет шаблонов — создайте текст в форме рассылки и нажмите
                    «Создать шаблон».
                  </p>
                ) : null}
              </Field>

              {activeEvent.delayMode === 'none' ? (
                <p className="text-[11px] leading-relaxed text-muted-2">
                  {activeEvent.hint}
                </p>
              ) : activeEvent.delayMode === 'days' ? (
                <Field label="Задержка отправки">
                  <div className="flex flex-wrap items-center gap-2">
                    {[1, 2].map((days) => (
                      <button
                        key={days}
                        type="button"
                        onClick={() =>
                          setDelayMinutes(String(days * 1440))
                        }
                        className={cn(
                          'rounded-lg border px-3 py-1.5 text-[12px]',
                          Number(delayMinutes) === days * 1440
                            ? 'border-[hsl(255_100%_68%/0.5)] text-foreground'
                            : 'border-border text-muted-2'
                        )}
                      >
                        {days} {days === 1 ? 'день' : 'дня'}
                      </button>
                    ))}
                    <input
                      value={
                        Number.isFinite(delayDays) ? String(delayDays) : '2'
                      }
                      onChange={(event) => {
                        const days = Math.min(
                          14,
                          Math.max(0, Number(event.target.value || 0))
                        );
                        setDelayMinutes(String(Math.round(days * 1440)));
                      }}
                      type="number"
                      min="0"
                      max="14"
                      step="1"
                      className="input-base w-24"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-2">
                    {activeEvent.hint}
                  </p>
                </Field>
              ) : (
                <Field label="Задержка отправки (мин)">
                  <input
                    value={delayMinutes}
                    onChange={(event) => setDelayMinutes(event.target.value)}
                    type="number"
                    min="0"
                    max="20160"
                    className="input-base max-w-[160px]"
                  />
                  <p className="mt-1 text-[11px] text-muted-2">
                    {activeEvent.hint}
                  </p>
                </Field>
              )}

              <p className="text-[11px] text-muted-2">
                История: «Авто · первая покупка», «Авто · лиды», «Авто · кэшбек
                сгорает». Язык клиента — PL или RU из шаблона.
              </p>
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-2">
                Превью
              </p>
              <div className="mt-2 rounded-xl bg-[hsl(234_22%_11%)] p-3">
                {previewMessage?.title ? (
                  <div className="mb-1 text-[12px] font-semibold text-foreground">
                    {previewMessage.title}
                  </div>
                ) : null}
                <div
                  className={PUSH_PREVIEW_CLASS}
                  dangerouslySetInnerHTML={{
                    __html: renderPushPreviewHtml(
                      previewText ||
                        (templateId
                          ? 'Выберите другой шаблон'
                          : 'Выберите шаблон')
                    ),
                  }}
                />
                {previewMessage?.promo ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Промокод: <code>{previewMessage.promo}</code>
                  </p>
                ) : null}
                {previewButtons
                  .filter((btn) => btn.text)
                  .map((btn, index) => (
                    <div
                      key={`${btn.text}-${index}`}
                      className="mt-1 rounded-md border border-[hsl(255_100%_68%/0.35)] px-2 py-1 text-center text-[10px] font-medium text-[hsl(255_100%_75%)]"
                    >
                      {btn.text}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending || !canSave}
        className="mt-4 inline-flex h-9 items-center justify-center rounded-lg bg-gradient-to-r from-[hsl(255_100%_68%)] to-[hsl(280_90%_60%)] px-4 text-[12px] font-medium text-white disabled:opacity-50"
      >
        {saveMutation.isPending ? 'Сохраняем…' : 'Сохранить для события'}
      </button>
    </div>
  );
}