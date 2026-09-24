import React, { useEffect, useMemo, useState } from 'react';

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

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { toast } from '@/components/ui/use-toast';
import { usePeriod } from '@/lib/PeriodContext';
import { cn } from '@/lib/utils';
import { CRM_API_URL, crmFetchJson } from '@/lib/crmFetch';
import {
  clearCrmSessionToken,
  setCrmSessionToken,
} from '@/lib/crmSession';

const TPL_PAGE_SIZE = 5;
const CAMPAIGN_PAGE_SIZE = 10;

const PERIOD_MAP = {
  Сегодня: 'today',
  Неделя: 'week',
  Месяц: 'month',
  '3 мес': '3m',
  '3 месяца': '3m',
  '6 мес': '6m',
  '6 месяцев': '6m',
  Всё: 'all',
  'Все время': 'all',
  'Всё время': 'all',
};

const crmFetch = crmFetchJson;

function toDateOnly(value) {
  const date = new Date(value);

  const year =
    date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, '0');

  const day = String(
    date.getDate()
  ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getPeriodPayload(
  period,
  range
) {
  const standardPeriod =
    PERIOD_MAP[
      String(period || '')
    ];

  if (standardPeriod) {
    return {
      period: standardPeriod,
    };
  }

  if (
    range?.start &&
    range?.end
  ) {
    return {
      from: toDateOnly(
        range.start
      ),

      to: toDateOnly(
        range.end
      ),
    };
  }

  return {
    period: 'month',
  };
}

function buildPeriodQuery(
  period,
  range
) {
  return new URLSearchParams(
    getPeriodPayload(
      period,
      range
    )
  ).toString();
}

function CampaignMobileRow({
  r,
}) {
  return (
    <div className="rounded-xl border border-border-soft bg-[hsl(232_26%_6%)] p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-foreground">
            {r.name}
          </div>

          <div className="text-[11px] text-muted-2">
            Аудитория:{' '}
            {r.audience}
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
              label:
                'Получателей',

              value:
                num(
                  r.recipients
                ),
            },

            {
              label:
                'Отправлено',

              value:
                num(
                  r.sent
                ),
            },

            {
              label:
                'Покупки',

              value:
                num(
                  r.purchases
                ),
            },
          ]}
        />

        <div className="mt-2.5">
          <MetricGrid
            cols={2}
            items={[
              {
                label:
                  'Конверсия',

                value:
                  `${Number(
                    r.conversion ||
                      0
                  )}%`,

                className:
                  'text-[hsl(255_100%_72%)]',
              },

              {
                label:
                  'Выручка',

                value:
                  currency(
                    r.revenue
                  ),

                className:
                  'text-foreground',
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

  const {
    period,
    range,
  } = usePeriod();

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
    minCashback,
    setMinCashback,
  ] = useState('');

  const [
    favProduct,
    setFavProduct,
  ] = useState('');

  const [
    telegram,
    setTelegram,
  ] = useState('');

  /*
   * MESSAGE
   */

  const [
    title,
    setTitle,
  ] = useState(
    'Вернуть спящих'
  );

  const [
    body,
    setBody,
  ] = useState(
    'Соскучились по вкусам? Вернись и получи −15% на ELF KING.'
  );

  const [
    promo,
    setPromo,
  ] = useState('');

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

  /*
   * PERIOD
   */

  const periodPayload =
    useMemo(
      () =>
        getPeriodPayload(
          period,
          range
        ),

      [
        period,
        range,
      ]
    );

  const periodQuery =
    useMemo(
      () =>
        buildPeriodQuery(
          period,
          range
        ),

      [
        period,
        range,
      ]
    );

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
    setTplName(
      title || ''
    );

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

  const pushMeta = {
    audiences:
      metaData
        ?.audiences ||
      [],

    statuses:
      metaData
        ?.statuses ||
      [],

    categories:
      metaData
        ?.categories ||
      [],

    locations:
      metaData
        ?.locations ||
      [],

    products:
      metaData
        ?.products ||
      [],
  };

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

  const audiencePayload =
    useMemo(
      () => ({
        audience,

        statuses:
          Array.from(
            statuses
          ),

        categoryKeys:
          Array.from(
            categories
          ),

        locationKeys:
          Array.from(
            locations
          ),

        minCheck:
          Number(
            minCheck ||
              0
          ),

        minCashback:
          Number(
            minCashback ||
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
      }),

      [
        audience,
        statuses,
        categories,
        locations,
        minCheck,
        minCashback,
        favProduct,
        telegram,
      ]
    );

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
    data:
      audiencePreview,

    isFetching:
      audiencePreviewLoading,
  } = useQuery({
    queryKey: [
      'crm-push-audience-preview',
      periodQuery,
      debouncedAudiencePayload,
    ],

    queryFn: () =>
      crmFetch(
        '/crm/push/audience-preview',
        {
          method:
            'POST',

          body:
            JSON.stringify(
              {
                ...periodPayload,

                ...debouncedAudiencePayload,
              }
            ),
        }
      ),
  });

  const recipients =
    Number(
      audiencePreview
        ?.total ||
        0
    );

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

const fileToDataUrl =
  (file) =>
    new Promise(
      (
        resolve,
        reject
      ) => {
        const reader =
          new FileReader();

        reader.onload =
          () =>
            resolve(
              String(
                reader.result ||
                  ''
              )
            );

        reader.onerror =
          () =>
            reject(
              new Error(
                'FILE_READ_FAILED'
              )
            );

        reader
          .readAsDataURL(
            file
          );
      }
    );

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

    if (
      file.size >
      10 * 1024 * 1024
    ) {
      toast({
        title:
          'Файл слишком большой',

        description:
          'Максимальный размер — 10 МБ',

        variant:
          'destructive',
      });

      return;
    }

    if (!isAuthenticated) {
      setAuthModalOpen(
        true
      );

      return;
    }

    setMediaUploading(
      true
    );

    try {
      const dataUrl =
        await fileToDataUrl(
          file
        );

      const data =
        await crmFetch(
          '/crm/push/upload-media',
          {
            method:
              'POST',

            body:
              JSON.stringify({
                dataUrl,
              }),
          }
        );

      if (
        mediaPreviewUrl
      ) {
        URL.revokeObjectURL(
          mediaPreviewUrl
        );
      }

      setMediaFile(
        file
      );

      setMediaPreviewUrl(
        URL.createObjectURL(
          file
        )
      );

      setPhotoFileId(
        String(
          data?.fileId ||
            ''
        )
      );

      setTemplatePhotoPreviewUrl(
  String(
    data?.photoPreviewUrl ||
      ''
  )
);

      toast({
        title:
          'Медиа добавлено',
      });
    } catch (error) {
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

      toast({
        title:
          'Не удалось загрузить изображение',

        description:
          error?.message ||
          'Ошибка загрузки',

        variant:
          'destructive',
      });
    } finally {
      setMediaUploading(
        false
      );
    }
  };

const removeMedia =
  () => {
    if (
      mediaPreviewUrl
    ) {
      URL.revokeObjectURL(
        mediaPreviewUrl
      );
    }

    setMediaFile(null);
    setMediaPreviewUrl('');
    setPhotoFileId('');
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
                    title:
                      tplName.trim(),

                    text:
                      body.trim(),

                    photoUrl:
                      '',

                      photoFileId:
                        photoFileId,

photoPreviewUrl:

  templatePhotoPreviewUrl,

                    buttonText:
                      '',

                    buttonUrl:
                      '',
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
        () =>
          crmFetch(
            '/crm/push/send',
            {
              method:
                'POST',

              body:
                JSON.stringify(
                  {
                    ...periodPayload,

                    name:
                      title.trim() ||
                      'Рассылка',

                    audience,

                    statuses:
                      Array.from(
                        statuses
                      ),

                    categoryKeys:
                      Array.from(
                        categories
                      ),

                    locationKeys:
                      Array.from(
                        locations
                      ),

                    minCheck:
                      Number(
                        minCheck ||
                          0
                      ),

                    minCashback:
                      Number(
                        minCashback ||
                          0
                      ),

                    favProduct:
                      favProduct.trim(),

                    telegram:
                      telegram.trim(),

                    title:
                      title.trim(),

                    text:
                      body.trim(),

                    promo:
                      promo.trim(),

                    photoUrl:
                      '',
                      photoFileId:

  photoFileId,

                    buttonText:
                      '',

                    buttonUrl:
                      '',

                    templateId:
                      activeTpl ||
                      null,
                  }
                ),
            }
          ),

      onSuccess:
        async (
          data
        ) => {
          setCampPage(
            1
          );

          await Promise.all([
            queryClient
              .invalidateQueries(
                {
                  queryKey: [
                    'crm-push-campaigns',
                  ],
                }
              ),

            queryClient
              .invalidateQueries(
                {
                  queryKey: [
                    'crm-push-templates',
                  ],
                }
              ),
          ]);

          toast({
            title:
              'Рассылка запущена',

            description:
              `Получателей: ${
                data
                  ?.campaign
                  ?.recipients ??
                recipients
              }`,
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

            MESSAGE_REQUIRED:
              'Заполни заголовок, текст или промокод',

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

      setTitle(
        template.title ||
          template.name ||
          ''
      );

      setBody(
        template.text ||
          template.preview ||
          ''
      );

      setPromo(
        template.promo ||
          ''
      );

setPhotoFileId(
  template.photoFileId ||
    ''
);

setTemplatePhotoPreviewUrl(
  template.photoPreviewUrl ||
    ''
);

setMediaFile(null);

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

setMediaPreviewUrl(
  template.photoPreviewUrl ||
    ''
);
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

  setTplName(
    title || ''
  );

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
        audiencePreviewLoading ||
        sendCampaignMutation
          .isPending
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
    setCampPage(
      1
    );
  }, [
    period,
    range,
  ]);

  const campPageCount =
    Math.max(
      1,

      Math.ceil(
        campaigns.length /
          CAMPAIGN_PAGE_SIZE
      )
    );

  const safeCampPage =
    Math.min(
      campPage,
      campPageCount
    );

  const campRows =
    campaigns.slice(
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
      key: 'name',
      header: 'Кампания',

      render: (r) => (
        <span className="font-medium text-foreground">
          {r.name}
        </span>
      ),
    },

    {
      key:
        'audience',

      header:
        'Аудитория',

      render: (r) => (
        <span className="text-muted-foreground">
          {r.audience}
        </span>
      ),
    },

    {
      key:
        'recipients',

      header:
        'Получателей',

      align:
        'right',

      render: (r) => (
        <span className="text-muted-foreground">
          {num(
            r.recipients
          )}
        </span>
      ),
    },

    {
      key:
        'sent',

      header:
        'Отправлено',

      align:
        'right',

      render: (r) => (
        <span className="text-muted-foreground">
          {num(
            r.sent
          )}
        </span>
      ),
    },

    {
      key:
        'purchases',

      header:
        'Покупки',

      align:
        'right',

      render: (r) => (
        <span className="text-muted-foreground">
          {num(
            r.purchases
          )}
        </span>
      ),
    },

    {
      key:
        'conversion',

      header:
        'Конверсия',

      align:
        'right',

      render: (r) => (
        <span className="font-medium text-[hsl(255_100%_72%)]">
          {Number(
            r.conversion ||
              0
          )}
          %
        </span>
      ),
    },

    {
      key:
        'revenue',

      header:
        'Выручка',

      align:
        'right',

      render: (r) => (
        <span className="font-medium text-foreground">
          {currency(
            r.revenue
          )}
        </span>
      ),
    },

    {
      key:
        'status',

      header:
        'Статус',

      render: (r) => (
        <Badge
          status={
            r.status
          }
        />
      ),
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

              {audiencePreviewLoading
                ? '…'
                : num(
                    recipients
                  )}{' '}
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
            </Section>

            <Section label="Статус клиента">
              <div className="flex flex-wrap gap-2">
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
              <div className="flex flex-wrap gap-2">
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
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={
                    minCheck
                  }
                  onChange={(
                    e
                  ) =>
                    setMinCheck(
                      e.target
                        .value
                    )
                  }
                  placeholder="Ср. чек >"
                  className="input-base"
                />

                <input
                  value={
                    minCashback
                  }
                  onChange={(
                    e
                  ) =>
                    setMinCashback(
                      e.target
                        .value
                    )
                  }
                  placeholder="Кэшбэк >"
                  className="input-base"
                />

                <input
                  value={
                    favProduct
                  }
                  onChange={(
                    e
                  ) =>
                    setFavProduct(
                      e.target
                        .value
                    )
                  }
                  placeholder="Любимый товар"
                  className="input-base"
                />

                <input
                  value={
                    telegram
                  }
                  onChange={(
                    e
                  ) =>
                    setTelegram(
                      e.target
                        .value
                    )
                  }
                  placeholder="@telegram / клиент"
                  className="input-base"
                />
              </div>
            </Section>
          </div>
        </div>

        {/* MESSAGE */}

        <div className="flex h-full flex-col rounded-2xl surface-card p-5">
          <h3 className="font-heading text-[14px] font-semibold text-foreground">
            Сообщение
          </h3>

          <div className="mt-4 space-y-3">
            <Field label="Заголовок">
              <input
                value={
                  title
                }
                onChange={(
                  e
                ) =>
                  setTitle(
                    e.target
                      .value
                  )
                }
                className="input-base"
              />
            </Field>

            <Field label="Текст">
              <textarea
                value={
                  body
                }
                onChange={(
                  e
                ) =>
                  setBody(
                    e.target
                      .value
                  )
                }
                rows={6}
                className="input-base resize-none"
              />
            </Field>

            <Field label="Промокод">
              <input
                value={
                  promo
                }
                onChange={(
                  e
                ) =>
                  setPromo(
                    e.target
                      .value
                  )
                }
                placeholder="ELFKING15"
                className="input-base"
              />
            </Field>

<div className="space-y-2">
  <label
    className={cn(
      'inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-[12px] text-muted-foreground hover:text-foreground',

      mediaUploading &&
        'pointer-events-none opacity-50'
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
      onChange={
        selectMedia
      }
      className="hidden"
    />
  </label>

  {mediaFile && (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border-soft bg-[hsl(232_26%_6%)] px-3 py-2">
      <span className="min-w-0 truncate text-[11px] text-muted-foreground">
        {
          mediaFile.name
        }
      </span>

      <button
        type="button"
        onClick={
          removeMedia
        }
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
    src={
      mediaPreviewUrl
    }
    alt="Медиа рассылки"
    className="mb-2 max-h-40 w-full rounded-lg object-cover"
  />
)}
                <div className="text-[12px] font-semibold text-foreground">
                  {title ||
                    'Заголовок'}
                </div>

                <div className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  {body ||
                    'Текст сообщения'}
                </div>

                {promo && (
                  <div className="mt-2 inline-block rounded bg-[hsl(255_100%_68%/0.15)] px-1.5 py-0.5 text-[10px] font-medium text-[hsl(255_100%_75%)]">
                    {
                      promo
                    }
                  </div>
                )}
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
                recipients <=
                  0 ||
                audiencePreviewLoading ||
                sendCampaignMutation
                  .isPending
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[hsl(255_100%_68%)] to-[hsl(280_90%_60%)] px-4 py-2 text-[13px] font-medium text-white shadow-[0_4px_20px_-6px_hsl(255_100%_68%)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />

              {sendCampaignMutation
                .isPending
                ? 'Запускаем…'
                : `Отправить (${
                    audiencePreviewLoading
                      ? '…'
                      : num(
                          recipients
                        )
                  })`}
            </button>
          </div>
        </div>
      </div>

      {/* TEMPLATES */}

      <div className="rounded-2xl surface-card p-2">
        <div className="flex items-center gap-2 px-4 py-3">
          <Layers className="h-4 w-4 text-muted-foreground" />

          <span className="text-[13px] font-medium text-foreground">
            Шаблоны
          </span>

          <span className="text-[12px] text-muted-2">
            ·{' '}
            {
              templates.length
            }
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
        {/* Выбор шаблона */}
        <button
          type="button"
          onClick={() =>
            applyTemplate(
              template
            )
          }
          className="w-full p-3 pr-14 text-left"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-[13px] font-medium text-foreground">
              {template.name ||
                template.title ||
                'Шаблон'}
            </span>

            <span className="shrink-0 text-[11px] text-[hsl(255_100%_72%)]">
              {Number(
                template.conversion ||
                  0
              )}
              % конв.
            </span>
          </div>

          <div className="mt-1 text-[12px] text-muted-foreground">
            {template.preview ||
              template.text ||
              ''}
          </div>

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

      {/* CAMPAIGNS */}

      <div className="rounded-2xl surface-card p-2">
        <div className="px-4 py-3 text-[13px] font-medium text-foreground">
          Эффективность рассылок
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

              <div className="mt-1 text-[13px] font-medium text-foreground">
                {title ||
                  'Заголовок'}
              </div>

              <div className="mt-0.5 text-[12px] text-muted-foreground">
                {body ||
                  'Текст сообщения'}
              </div>

              {promo && (
                <div className="mt-1 text-[11px] text-[hsl(255_100%_72%)]">
                  Промокод:{' '}
                  {
                    promo
                  }
                </div>
              )}
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

function Section({
  label,
  children,
}) {
  return (
    <div>
      <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-2">
        {label}
      </div>

      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={cn(
        'rounded-full border px-3 py-1 text-[12px] transition-all',

        active
          ? 'border-[hsl(255_100%_68%/0.4)] bg-[hsl(255_100%_68%/0.14)] text-foreground'
          : 'border-border text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  children,
}) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider text-muted-2">
        {label}
      </label>

      <div className="mt-1.5">
        {children}
      </div>
    </div>
  );
}